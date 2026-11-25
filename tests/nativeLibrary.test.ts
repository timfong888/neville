import { describe, expect, it } from "vitest";
import { type Manifestation, newId } from "@/lib/library/model";
import { type LibraryFiles, extFor, makeFileLibrary } from "@/native/src/seams/libraryCore";

function disk(): LibraryFiles & { files: Map<string, Uint8Array | string>; failRecords: boolean } {
  const files = new Map<string, Uint8Array | string>();
  const find = (id: string, staged = false) => [...files.keys()].find((k) => k.startsWith(`${id}.`) && k.endsWith(".new") === staged);
  const d = {
    files,
    failRecords: false,
    readRecords: async () => (files.get("library.json") as string | undefined) ?? null,
    writeRecords: async (json: string) => {
      if (d.failRecords) throw new Error("disk full");
      files.set("library.json", json);
    },
    stageAudio: async (id: string, a: { bytes: Uint8Array; mime: string }) => {
      if (a.bytes.length === 0) throw new Error("disk full");
      files.set(`${id}.${extFor(a.mime)}.new`, a.bytes);
    },
    commitAudio: async (id: string) => {
      const s = find(id, true)!;
      if (find(id)) files.delete(find(id)!);
      files.set(s.slice(0, -4), files.get(s)!);
      files.delete(s);
    },
    discardStaged: async (id: string) => void (find(id, true) && files.delete(find(id, true)!)),
    deleteAudio: async (id: string) => void (find(id) && files.delete(find(id)!)),
    audioUri: async (id: string) => (find(id) ? `file:///library/${find(id)}` : null),
  };
  return d;
}

const item = (over: Partial<Manifestation> = {}): Manifestation => ({
  id: newId(), title: "A calm morning", want: "calm", firstName: "", lines: ["I am calm.", "I am here."],
  voiceId: "gemini-sulafat", voiceName: "Sulafat", hasAudio: false, createdAt: 1, updatedAt: 1, ...over,
});
const mp3 = { bytes: new Uint8Array([1, 2, 3]), mime: "audio/mpeg" };

describe("native library store", () => {
  it("starts empty and survives unreadable records", async () => {
    const d = disk();
    expect(await makeFileLibrary(d).load()).toEqual({ manifestations: [], playlists: [] });
    d.files.set("library.json", "{not json");
    expect((await makeFileLibrary(d).load()).manifestations).toEqual([]);
  });

  it("saves an item with its recording and reads it back after a restart", async () => {
    const d = disk();
    const m = item();
    await makeFileLibrary(d).save(m, mp3);
    const again = makeFileLibrary(d); // a new store over the same files: a force-quit and reopen
    expect(await again.get(m.id)).toEqual({ ...m, hasAudio: true });
    expect(await again.audioUri(m.id)).toBe(`file:///library/${m.id}.mp3`);
  });

  it("puts new items first, replaces by id, and keeps the recording on a title edit", async () => {
    const lib = makeFileLibrary(disk());
    const a = item({ title: "A" });
    const b = item({ title: "B" });
    await lib.save(a, mp3);
    await lib.save(b);
    await lib.save({ ...a, title: "A2", hasAudio: false });
    const got = (await lib.load()).manifestations;
    expect(got.map((m) => m.title)).toEqual(["B", "A2"]);
    expect(got[1].hasAudio).toBe(true);
    expect(got[0].hasAudio).toBe(false);
  });

  it("removes the recording on null, and swaps files when the format changes", async () => {
    const d = disk();
    const lib = makeFileLibrary(d);
    const m = item();
    await lib.save(m, mp3);
    await lib.save(m, { bytes: new Uint8Array([9]), mime: "audio/wav" });
    expect([...d.files.keys()].sort()).toEqual([`${m.id}.wav`, "library.json"].sort());
    await lib.save(m, null);
    expect(await lib.audioUri(m.id)).toBeNull();
    expect((await lib.get(m.id))?.hasAudio).toBe(false);
  });

  it("keeps the old recording when its replacement cannot be written", async () => {
    const lib = makeFileLibrary(disk());
    const m = item();
    await lib.save(m, mp3);
    await expect(lib.save(m, { bytes: new Uint8Array(0), mime: "audio/wav" })).rejects.toThrow("disk full");
    expect(await lib.audioUri(m.id)).toBe(`file:///library/${m.id}.mp3`);
    expect((await lib.get(m.id))?.hasAudio).toBe(true);
  });

  it("keeps the old recording and leaves no stray file when the records cannot be written", async () => {
    const d = disk();
    const lib = makeFileLibrary(d);
    const m = item();
    await lib.save(m, mp3);
    d.failRecords = true;
    await expect(lib.save({ ...m, title: "New" }, { bytes: new Uint8Array([9]), mime: "audio/wav" })).rejects.toThrow("disk full");
    await expect(lib.remove(m.id)).rejects.toThrow("disk full");
    d.failRecords = false;
    expect(await lib.audioUri(m.id)).toBe(`file:///library/${m.id}.mp3`);
    expect(await lib.get(m.id)).toEqual({ ...m, hasAudio: true });
    expect([...d.files.keys()].sort()).toEqual([`${m.id}.mp3`, "library.json"].sort());
  });

  it("refuses to change a library it cannot read, so nothing is overwritten", async () => {
    const d = disk();
    d.files.set("library.json", '{"manifestations":[{"id":');
    const lib = makeFileLibrary(d);
    await expect(lib.save(item(), mp3)).rejects.toThrow(/could not be read/);
    await expect(lib.remove(newId())).rejects.toThrow(/could not be read/);
    expect([...d.files.entries()]).toEqual([["library.json", '{"manifestations":[{"id":']]);
  });

  it("keeps every item when saves and deletes overlap", async () => {
    const lib = makeFileLibrary(disk());
    const [a, b, c] = [item({ title: "A" }), item({ title: "B" }), item({ title: "C" })];
    await lib.save(c);
    await Promise.all([lib.save(a, mp3), lib.save(b, mp3), lib.remove(c.id)]);
    expect((await lib.load()).manifestations.map((m) => m.title).sort()).toEqual(["A", "B"]);
  });

  it("deletes the item and its file, and tells subscribers", async () => {
    const d = disk();
    const lib = makeFileLibrary(d);
    const m = item();
    let calls = 0;
    lib.subscribe(() => calls++);
    await lib.save(m, mp3);
    await lib.remove(m.id);
    expect(await lib.get(m.id)).toBeNull();
    expect([...d.files.keys()]).toEqual(["library.json"]);
    expect(calls).toBe(2);
  });

  it("refuses an id that is not a UUID, so an id can never be a path", async () => {
    const lib = makeFileLibrary(disk());
    await expect(lib.save(item({ id: "../../etc" }), mp3)).rejects.toThrow();
    expect(await lib.audioUri("../x")).toBeNull();
  });

  it("names files by format", () => {
    expect([extFor("audio/mpeg"), extFor("audio/wav; codecs=1"), extFor("audio/mp4"), extFor("")]).toEqual(["mp3", "wav", "m4a", "mp3"]);
  });
});
