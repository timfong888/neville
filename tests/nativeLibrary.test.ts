import { describe, expect, it } from "vitest";
import { type Manifestation, newId } from "@/lib/library/model";
import { type LibraryFiles, extFor, makeFileLibrary, makeUrlCache } from "@/native/src/seams/libraryCore";

type Disk = LibraryFiles & { files: Map<string, Uint8Array | string>; fail: (op: string, name: string) => boolean; audio: () => string[] };
/** A folder in memory. `fail` makes one call throw, as a full disk or a killed app would. */
function disk(): Disk {
  const files = new Map<string, Uint8Array | string>();
  const guard = (op: string, name: string) => {
    if (d.fail(op, name)) throw new Error("disk full");
  };
  const d: Disk = {
    files,
    fail: () => false,
    audio: () => [...files.keys()].filter((k) => !k.startsWith("library.json")),
    list: async () => [...files.keys()],
    read: async (name) => (files.get(name) as string | undefined) ?? null,
    write: async (name, data) => {
      if (d.fail("write", name)) {
        files.set(name, typeof data === "string" ? data.slice(0, 5) : data.slice(0, 1)); // half-written
        throw new Error("disk full");
      }
      files.set(name, data);
    },
    move: async (from, to) => {
      guard("move", from);
      files.set(to, files.get(from)!);
      files.delete(from);
    },
    remove: async (name) => {
      guard("remove", name);
      files.delete(name);
    },
    uri: async (name) => (files.has(name) ? `file:///library/${name}` : null),
  };
  return d;
}
const bytesAt = (d: Disk, uri: string | null) => d.files.get(uri!.replace("file:///library/", ""));

const item = (over: Partial<Manifestation> = {}): Manifestation => ({
  id: newId(), title: "A calm morning", want: "calm", firstName: "", lines: ["I am calm.", "I am here."],
  voiceId: "gemini-sulafat", voiceName: "Sulafat", hasAudio: false, createdAt: 1, updatedAt: 1, ...over,
});
const mp3 = { bytes: new Uint8Array([1, 2, 3]), mime: "audio/mpeg" };
const wav = { bytes: new Uint8Array([9, 9]), mime: "audio/wav" };

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
    expect(await again.audioUri(m.id)).toMatch(new RegExp(`^file:///library/${m.id}\\.[0-9a-f]{8}\\.mp3$`));
    expect(bytesAt(d, await again.audioUri(m.id))).toEqual(mp3.bytes);
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
    await lib.save(m, wav);
    expect(d.audio()).toHaveLength(1);
    expect(await lib.audioUri(m.id)).toMatch(/\.wav$/);
    await lib.save(m, null);
    expect(await lib.audioUri(m.id)).toBeNull();
    expect((await lib.get(m.id))?.hasAudio).toBe(false);
    expect(d.audio()).toEqual([]);
  });

  // The app can stop at any file call. Each case stops one call during a re-record, then reopens the app.
  it.each([
    ["writing the new recording", "write", ".wav", "old"],
    ["writing the records", "write", "library.json.new", "old"],
    ["removing the old records", "remove", "library.json", "old"],
    ["moving the new records into place", "move", "library.json.new", "new"],
    ["removing the old recording", "remove", ".mp3", "new"],
  ])("keeps a whole recording that matches the records when the app stops while %s", async (_step, op, suffix, want) => {
    const d = disk();
    const m = item();
    await makeFileLibrary(d).save(m, mp3);
    d.fail = (o, name) => o === op && name.endsWith(suffix);
    await makeFileLibrary(d).save({ ...m, title: "New" }, wav).catch(() => undefined);
    d.fail = () => false;
    const again = makeFileLibrary(d);
    expect((await again.get(m.id))?.title).toBe(want === "new" ? "New" : m.title);
    expect((await again.get(m.id))?.hasAudio).toBe(true);
    expect(bytesAt(d, await again.audioUri(m.id))).toEqual(want === "new" ? wav.bytes : mp3.bytes);
    expect(d.audio()).toHaveLength(1); // the next start removed the file nothing names
  });

  it("removes leftover recordings at the next start, and nothing while the records are unreadable", async () => {
    const d = disk();
    const m = item();
    await makeFileLibrary(d).save(m, mp3);
    const stray = `${newId()}.0a1b2c3d.mp3`;
    d.files.set(stray, new Uint8Array([7]));
    d.files.set("notes.txt", "not ours");
    await makeFileLibrary(d).load();
    expect(d.audio().sort()).toEqual([(await makeFileLibrary(d).audioUri(m.id))!.replace("file:///library/", ""), "notes.txt"].sort());
    const kept = d.audio().length;
    const good = d.files.get("library.json")!;
    for (const bad of ['{"manifestations":[{"id":', "{}", "[]", "null"]) {
      d.files.set("library.json", bad);
      await makeFileLibrary(d).load();
      expect(d.audio()).toHaveLength(kept);
    }
    d.files.set("library.json", good);
    expect(await makeFileLibrary(d).audioUri(m.id)).not.toBeNull();
  });

  it("recovers when the very first save stops half-way, and never deletes the only copy of the records", async () => {
    const d = disk();
    d.fail = (o, name) => o === "write" && name === "library.json.new";
    await expect(makeFileLibrary(d).save(item())).rejects.toThrow("disk full");
    expect(d.files.has("library.json.new")).toBe(true); // half-written, no library.json
    d.fail = () => false;
    const a = item({ title: "A" });
    await makeFileLibrary(d).save(a); // not locked out
    // The app stops after library.json is removed: library.json.new is the only copy.
    d.fail = (o, name) => o === "move" && name === "library.json.new";
    const b = item({ title: "B" });
    await makeFileLibrary(d).save(b).catch(() => undefined);
    expect(d.files.has("library.json")).toBe(false);
    // The next write fails too. The only copy must survive it.
    d.fail = (o, name) => o === "write" && name === "library.json.new";
    await expect(makeFileLibrary(d).save(item({ title: "C" }))).rejects.toThrow("disk full");
    d.fail = () => false;
    expect((await makeFileLibrary(d).load()).manifestations.map((m) => m.title)).toEqual(["B", "A"]);
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

  it("re-records in the same format even when the new file name would equal the old one", async () => {
    const d = disk();
    const lib = makeFileLibrary(d, () => "0a1b2c3d"); // every recording asks for the same name
    const m = item();
    const again = { bytes: new Uint8Array([4, 5, 6, 7]), mime: "audio/mpeg" };
    await lib.save(m, mp3);
    const first = await lib.audioUri(m.id);
    d.fail = (o, name) => o === "write" && name === "library.json.new";
    await expect(lib.save(m, again)).rejects.toThrow("disk full");
    expect(bytesAt(d, await lib.audioUri(m.id))).toEqual(mp3.bytes); // the live file was not touched
    d.fail = () => false;
    await lib.save(m, again);
    expect(await lib.audioUri(m.id)).not.toBe(first);
    expect(bytesAt(d, await lib.audioUri(m.id))).toEqual(again.bytes);
    expect(d.audio()).toHaveLength(1);
  });

  it("puts recordings back in the library when the records are lost, and keeps them after later saves", async () => {
    const d = disk();
    const m = item();
    await makeFileLibrary(d).save(m, mp3);
    const [file] = d.audio();
    d.files.delete("library.json");
    d.files.set("library.json.new", '{"manif'); // lost records and a half-written replacement
    const lib = makeFileLibrary(d);
    const got = await lib.get(m.id);
    expect(got).toMatchObject({ id: m.id, title: "Recovered recording", hasAudio: true });
    expect(bytesAt(d, await lib.audioUri(m.id))).toEqual(mp3.bytes);
    // A save in the same session, then two restarts: the old recording must survive both.
    await lib.save(item({ title: "New" }), wav);
    await makeFileLibrary(d).load();
    const again = makeFileLibrary(d);
    expect((await again.load()).manifestations.map((x) => x.title)).toEqual(["New", "Recovered recording"]);
    expect(bytesAt(d, await again.audioUri(m.id))).toEqual(mp3.bytes);
    expect(d.audio()).toContain(file);
  });

  it("removes no recording when a leftover records file is valid JSON but not a library", async () => {
    const d = disk();
    const m = item();
    await makeFileLibrary(d).save(m, mp3);
    const [file] = d.audio();
    for (const leftover of ["null", "{}", "7"]) {
      d.files.delete("library.json");
      d.files.set("library.json.new", leftover);
      const lib = makeFileLibrary(d);
      await lib.load();
      expect(d.audio()).toEqual([file]);
      expect(bytesAt(d, await lib.audioUri(m.id))).toEqual(mp3.bytes);
    }
  });

  it("starts empty with no records and no recordings, and writes nothing", async () => {
    const d = disk();
    expect((await makeFileLibrary(d).load()).manifestations).toEqual([]);
    expect([...d.files.keys()]).toEqual([]);
  });

  it("treats only UUIDs as recording ids in audioUri and remove", async () => {
    const d = disk();
    const lib = makeFileLibrary(d);
    const m = item();
    await lib.save(m, mp3);
    const asked: unknown[] = [];
    const uri = d.uri;
    d.uri = (name) => (asked.push(name), uri(name));
    for (const id of ["constructor", "__proto__", "toString", "../x"]) {
      expect(await lib.audioUri(id)).toBeNull();
      await lib.remove(id);
    }
    expect(asked).toEqual([]);
    expect(await lib.audioUri(m.id)).not.toBeNull();
    expect((await lib.get(m.id))?.hasAudio).toBe(true);
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

describe("web recording addresses", () => {
  it("hands out one address per recording, and a new one after the recording changes elsewhere", async () => {
    let stored: Blob | null = new Blob(["old"]);
    let n = 0;
    const revoked: string[] = [];
    const cache = makeUrlCache(async () => stored, { createObjectURL: () => `blob:${++n}`, revokeObjectURL: (u) => void revoked.push(u) });
    expect([await cache.uri("a"), await cache.uri("a")]).toEqual(["blob:1", "blob:1"]);
    stored = new Blob(["new"]); // another tab replaced it; the page hears a storage event
    cache.clear();
    expect(await cache.uri("a")).toBe("blob:2");
    expect(revoked).toEqual(["blob:1"]);
  });

  it("does not keep a copy read while the recording was being replaced", async () => {
    let stored = new Blob(["old"]);
    const made: Blob[] = [];
    let release = () => {};
    let slow = true;
    const getAudio = async () => {
      const b = stored;
      if (slow) await new Promise<void>((r) => (release = r));
      return b;
    };
    const cache = makeUrlCache(getAudio, { createObjectURL: (b) => `blob:${made.push(b as Blob)}`, revokeObjectURL: () => {} });
    const pending = cache.uri("a"); // reads "old", then waits
    stored = new Blob(["new"]);
    cache.clear();
    slow = false;
    release();
    await pending;
    expect(await made[made.length - 1].text()).toBe("new");
  });
});
