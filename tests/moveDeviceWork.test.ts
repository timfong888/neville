import { describe, expect, it } from "vitest";
import { moveDeviceWork, type MovedIds, type MoveSource, type MoveTarget } from "@/lib/account/moveDeviceWork";
import { addItem, isUuid, makePlaylist, type Manifestation, newId, type Playlist } from "@/lib/library/model";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const U3 = "33333333-3333-4333-8333-333333333333";
const ACC = "acct-1";

const m = (id: string, hasAudio: boolean, t: number): Manifestation => ({
  id, title: `T ${id.slice(0, 4)}`, want: "w", firstName: "", lines: ["a"], voiceId: "v", voiceName: "V",
  hasAudio, createdAt: t, updatedAt: t,
});

function fakes(ms: Manifestation[], ps: Playlist[], opts: { audio?: Record<string, Blob | null>; reject?: string[] } = {}) {
  const deleted = { m: [] as string[], p: [] as string[] };
  const saved = { m: [] as Manifestation[], p: [] as Playlist[], audio: [] as (Blob | null | undefined)[] };
  const device: MoveSource = {
    load: async () => ({ manifestations: ms, playlists: ps }),
    getAudio: async (id) => opts.audio?.[id] ?? null,
    deleteManifestation: async (id) => void deleted.m.push(id),
    deletePlaylist: async (id) => void deleted.p.push(id),
    movedIds: async () => ({}),
    setMovedIds: async () => {},
    idsUsedByOtherAccounts: async () => new Set(),
  };
  const target: MoveTarget = {
    saveManifestation: async (x, a) => {
      if (opts.reject?.includes(x.id)) throw new Error("Bad id.");
      saved.m.push(x);
      saved.audio.push(a);
    },
    savePlaylist: async (p) => void saved.p.push(p),
  };
  return { device, target, deleted, saved };
}

describe("moveDeviceWork", () => {
  it("moves everything and clears the device when all goes well", async () => {
    const blob = new Blob(["x"]);
    const p = addItem(addItem({ ...makePlaylist("P"), id: U3 }, U1), U2);
    const f = fakes([m(U1, true, 1), m(U2, false, 2)], [p], { audio: { [U1]: blob } });
    const r = await moveDeviceWork(f.device, f.target, ACC);
    expect(r).toEqual({ moved: 2, kept: [] });
    expect(f.saved.audio[0]).toBe(blob);
    expect(f.saved.p[0].itemIds).toEqual([U1, U2]);
    expect(f.deleted.m.sort()).toEqual([U1, U2].sort());
    expect(f.deleted.p).toEqual([U3]);
  });

  it("keeps a manifestation on the device when its recording cannot be read", async () => {
    const p = addItem(addItem({ ...makePlaylist("P"), id: U3 }, U1), U2);
    const f = fakes([m(U1, true, 1), m(U2, false, 2)], [p], { audio: { [U1]: null } });
    const r = await moveDeviceWork(f.device, f.target, ACC);
    expect(r.moved).toBe(1);
    expect(r.kept[0].reason).toMatch(/recording/);
    expect(f.saved.m.map((x) => x.id)).toEqual([U2]);
    expect(f.saved.p).toEqual([]); // no partial playlist in the account
    expect(r.kept.map((k) => k.title)).toContain("P");
    expect(f.deleted.p).toEqual([]); // playlist still references U1, so it stays
    expect(f.deleted.m).toEqual([]); // and so do both items it lists, U1's recording included
  });

  // A real-ish device: deleting a manifestation strips it from playlists, as
  // DeviceStore does, and the moved-ids record persists between passes.
  function realDevice(ms: Manifestation[], ps: Playlist[], readable: () => boolean, blob: Blob) {
    const state = { lib: { manifestations: ms, playlists: ps }, movedIds: {} as Record<string, MovedIds> };
    const device: MoveSource = {
      load: async () => state.lib,
      getAudio: async (id) => (ms.find((x) => x.id === id)?.hasAudio && readable() ? blob : null),
      deleteManifestation: async (id) => {
        state.lib = {
          manifestations: state.lib.manifestations.filter((x) => x.id !== id),
          playlists: state.lib.playlists.map((p) => ({ ...p, itemIds: p.itemIds.filter((x) => x !== id) })),
        };
      },
      deletePlaylist: async (id) => {
        state.lib = { ...state.lib, playlists: state.lib.playlists.filter((p) => p.id !== id) };
      },
      movedIds: async (acc) => ({ ...(state.movedIds[acc] ?? {}) }),
      setMovedIds: async (acc, ids) => void (state.movedIds[acc] = { ...ids }),
      idsUsedByOtherAccounts: async (acc) =>
        new Set(Object.entries(state.movedIds).filter(([a]) => a !== acc).flatMap(([, r]) => Object.values(r).map((e) => e.id))),
    };
    return { device, state };
  }

  it("a retry after a partial move saves the whole playlist once, in order", async () => {
    let readable = false;
    const { device, state } = realDevice(
      [m(U1, false, 1), m(U2, true, 2)],
      [addItem(addItem({ ...makePlaylist("P"), id: U3 }, U1), U2)],
      () => readable,
      new Blob(["x"]),
    );
    const account = new Map<string, Playlist>();
    const savedM: string[] = [];
    const target: MoveTarget = {
      saveManifestation: async (x) => void savedM.push(x.id),
      savePlaylist: async (p) => void account.set(p.id, p),
    };

    const first = await moveDeviceWork(device, target, ACC);
    expect(first.kept.map((k) => k.title)).toEqual(["T 2222", "P"]);
    expect(account.size).toBe(0);

    readable = true;
    const second = await moveDeviceWork(device, target, ACC);
    expect(second).toEqual({ moved: 1, kept: [] });
    expect(account.get(U3)?.itemIds).toEqual([U1, U2]);
    expect(savedM).toEqual([U1, U2]); // U1 was not saved a second time
    expect(state.lib).toEqual({ manifestations: [], playlists: [] });
    expect(state.movedIds[ACC]).toEqual({});
  });

  it("does not overwrite account edits to an item it already moved", async () => {
    const { device } = realDevice(
      [m(U1, false, 1), m(U2, true, 2)],
      [addItem(addItem({ ...makePlaylist("P"), id: U3 }, U1), U2)],
      () => false,
      new Blob(["x"]),
    );
    const account = new Map<string, Manifestation>();
    const target: MoveTarget = {
      saveManifestation: async (x) => void account.set(x.id, x),
      savePlaylist: async () => {},
    };
    await moveDeviceWork(device, target, ACC);
    account.set(U1, { ...account.get(U1)!, title: "Renamed in the account" });
    await moveDeviceWork(device, target, ACC);
    await moveDeviceWork(device, target, ACC);
    expect(account.get(U1)?.title).toBe("Renamed in the account");
  });

  it("gives a held legacy item one account id across passes", async () => {
    let readable = false;
    const { device } = realDevice(
      [m("lx3k-abc", false, 1), m(U2, true, 2)],
      [addItem(addItem({ ...makePlaylist("P"), id: "old-pl" }, "lx3k-abc"), U2)],
      () => readable,
      new Blob(["x"]),
    );
    const savedM: string[] = [];
    const playlists: Playlist[] = [];
    const target: MoveTarget = {
      saveManifestation: async (x) => void savedM.push(x.id),
      savePlaylist: async (p) => void playlists.push(p),
    };
    await moveDeviceWork(device, target, ACC);
    await moveDeviceWork(device, target, ACC);
    readable = true;
    await moveDeviceWork(device, target, ACC);
    expect(savedM).toHaveLength(2); // the legacy item once, U2 once
    expect(playlists).toHaveLength(1);
    expect(playlists[0].itemIds).toEqual(savedM);
  });

  it("saves a device edit made after the first move as a new item, losing nothing", async () => {
    let readable = false;
    const { device, state } = realDevice(
      [m(U1, false, 1), m(U2, true, 2)],
      [addItem(addItem({ ...makePlaylist("P"), id: U3 }, U1), U2)],
      () => readable,
      new Blob(["x"]),
    );
    const account = new Map<string, Manifestation>();
    const playlists: Playlist[] = [];
    const target: MoveTarget = {
      saveManifestation: async (x) => void account.set(x.id, x),
      savePlaylist: async (p) => void playlists.push(p),
    };
    await moveDeviceWork(device, target, ACC);
    // Signed out, the person renames U1 on the device.
    state.lib = {
      ...state.lib,
      manifestations: state.lib.manifestations.map((x) => (x.id === U1 ? { ...x, title: "Edited on device", updatedAt: 9 } : x)),
    };
    readable = true;
    const r = await moveDeviceWork(device, target, ACC);
    expect(r.kept).toEqual([]);
    expect(account.get(U1)?.title).toBe("T 1111"); // the account's copy is untouched
    const copy = [...account.values()].find((x) => x.title === "Edited on device");
    expect(copy && copy.id !== U1).toBe(true); // and the edit is kept beside it
    expect(playlists[0].itemIds).toEqual([copy!.id, U2]);
    expect(state.lib.manifestations).toEqual([]);
  });

  it("moves a held item to a second account under a fresh id", async () => {
    const { device, state } = realDevice(
      [m(U1, false, 1), m(U2, true, 2)],
      [addItem(addItem({ ...makePlaylist("P"), id: U3 }, U1), U2)],
      () => false,
      new Blob(["x"]),
    );
    // Like the server: ids are global, and one account cannot save over another's.
    const owner = new Map<string, string>();
    const savedBy: string[] = [];
    const t = (who: string): MoveTarget => ({
      saveManifestation: async (x) => {
        if (owner.has(x.id) && owner.get(x.id) !== who) throw new Error("Not found.");
        owner.set(x.id, who);
        savedBy.push(`${who}:${x.id}`);
      },
      savePlaylist: async () => {},
    });
    await moveDeviceWork(device, t("a"), "acct-a");
    const r = await moveDeviceWork(device, t("b"), "acct-b");
    expect(r.kept.map((k) => k.reason)).not.toContain("Not found.");
    expect(savedBy[0]).toBe(`a:${U1}`);
    const bId = savedBy[1].slice(2);
    expect(savedBy[1].startsWith("b:") && bId !== U1 && isUuid(bId)).toBe(true);
    expect(state.movedIds["acct-b"][U1].id).toBe(bId);
  });


  it("carries on past an item the account rejects", async () => {
    const f = fakes([m(U1, false, 1), m(U2, false, 2)], [], { reject: [U1] });
    const r = await moveDeviceWork(f.device, f.target, ACC);
    expect(r.moved).toBe(1);
    expect(r.kept).toEqual([{ title: "T 1111", reason: "Bad id." }]);
    expect(f.deleted.m).toEqual([U2]);
  });

  it("gives old non-UUID ids a fresh id and updates playlists to match", async () => {
    const p = addItem({ ...makePlaylist("P"), id: "old-playlist" }, "lx3k-abc");
    const f = fakes([m("lx3k-abc", false, 1)], [p]);
    const r = await moveDeviceWork(f.device, f.target, ACC);
    expect(r.moved).toBe(1);
    const newMid = f.saved.m[0].id;
    expect(isUuid(newMid)).toBe(true);
    expect(isUuid(f.saved.p[0].id)).toBe(true);
    expect(f.saved.p[0].itemIds).toEqual([newMid]);
    expect(f.deleted.m).toEqual(["lx3k-abc"]);
    expect(f.deleted.p).toEqual(["old-playlist"]);
  });
});

describe("newId", () => {
  it("is always a v4 UUID, even without crypto.randomUUID", () => {
    expect(isUuid(newId())).toBe(true);
    const c = globalThis.crypto as { randomUUID?: unknown };
    const saved = c.randomUUID;
    Object.defineProperty(c, "randomUUID", { value: undefined, configurable: true });
    try {
      const id = newId();
      expect(isUuid(id)).toBe(true);
      expect(id[14]).toBe("4");
    } finally {
      Object.defineProperty(c, "randomUUID", { value: saved, configurable: true });
    }
  });
});
