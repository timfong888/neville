import { describe, expect, it } from "vitest";
import { moveDeviceWork, type MoveSource, type MoveTarget } from "@/lib/account/moveDeviceWork";
import { addItem, isUuid, makePlaylist, type Manifestation, newId, type Playlist } from "@/lib/library/model";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const U3 = "33333333-3333-4333-8333-333333333333";

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
    const r = await moveDeviceWork(f.device, f.target);
    expect(r).toEqual({ moved: 2, kept: [] });
    expect(f.saved.audio[0]).toBe(blob);
    expect(f.saved.p[0].itemIds).toEqual([U1, U2]);
    expect(f.deleted.m.sort()).toEqual([U1, U2].sort());
    expect(f.deleted.p).toEqual([U3]);
  });

  it("keeps a manifestation on the device when its recording cannot be read", async () => {
    const p = addItem(addItem({ ...makePlaylist("P"), id: U3 }, U1), U2);
    const f = fakes([m(U1, true, 1), m(U2, false, 2)], [p], { audio: { [U1]: null } });
    const r = await moveDeviceWork(f.device, f.target);
    expect(r.moved).toBe(1);
    expect(r.kept[0].reason).toMatch(/recording/);
    expect(f.saved.m.map((x) => x.id)).toEqual([U2]);
    expect(f.saved.p[0].itemIds).toEqual([U2]);
    expect(f.deleted.p).toEqual([]); // playlist still references U1, so it stays
    expect(f.deleted.m).toEqual([]); // and so do both items it lists, U1's recording included
  });

  it("a retry after a partial move keeps the whole playlist, in order", async () => {
    // A real-ish device: deleting a manifestation strips it from playlists, as DeviceStore does.
    const blob = new Blob(["x"]);
    let lib = {
      manifestations: [m(U1, false, 1), m(U2, true, 2)],
      playlists: [addItem(addItem({ ...makePlaylist("P"), id: U3 }, U1), U2)],
    };
    let readable = false;
    const device: MoveSource = {
      load: async () => lib,
      getAudio: async (id) => (id === U2 && readable ? blob : null),
      deleteManifestation: async (id) => {
        lib = {
          manifestations: lib.manifestations.filter((x) => x.id !== id),
          playlists: lib.playlists.map((p) => ({ ...p, itemIds: p.itemIds.filter((x) => x !== id) })),
        };
      },
      deletePlaylist: async (id) => {
        lib = { ...lib, playlists: lib.playlists.filter((p) => p.id !== id) };
      },
    };
    const account = new Map<string, Playlist>();
    const target: MoveTarget = { saveManifestation: async () => {}, savePlaylist: async (p) => void account.set(p.id, p) };

    const first = await moveDeviceWork(device, target);
    expect(first.kept).toHaveLength(1);
    expect(account.get(U3)?.itemIds).toEqual([U1]);

    readable = true;
    const second = await moveDeviceWork(device, target);
    expect(second.kept).toEqual([]);
    expect(account.get(U3)?.itemIds).toEqual([U1, U2]);
    expect(lib).toEqual({ manifestations: [], playlists: [] });
  });

  it("carries on past an item the account rejects", async () => {
    const f = fakes([m(U1, false, 1), m(U2, false, 2)], [], { reject: [U1] });
    const r = await moveDeviceWork(f.device, f.target);
    expect(r.moved).toBe(1);
    expect(r.kept).toEqual([{ title: "T 1111", reason: "Bad id." }]);
    expect(f.deleted.m).toEqual([U2]);
  });

  it("gives old non-UUID ids a fresh id and updates playlists to match", async () => {
    const p = addItem({ ...makePlaylist("P"), id: "old-playlist" }, "lx3k-abc");
    const f = fakes([m("lx3k-abc", false, 1)], [p]);
    const r = await moveDeviceWork(f.device, f.target);
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
