// The phone's library store, written against a tiny file interface so the repo's unit tests can run it.
// Framework-free. Records are one JSON document. Each recording is one file that is never rewritten:
// a new recording gets a new name, and the records say which file is current.
import { type Library, type Manifestation, isUuid, newId, parseLibrary, withoutManifestation } from "@/lib/library/model";
import type { AudioBytes, DeviceLibrary } from "./library.types";

/** What the store needs from the device: plain files in one folder. Any call may fail part-way. */
export type LibraryFiles = {
  list(): Promise<string[]>;
  read(name: string): Promise<string | null>;
  /** Creates or replaces the file. Throws when the device is full. */
  write(name: string, data: string | Uint8Array): Promise<void>;
  /** Renames. `to` does not exist when this is called. */
  move(from: string, to: string): Promise<void>;
  /** Does nothing when the file is missing. */
  remove(name: string): Promise<void>;
  uri(name: string): Promise<string | null>;
};

const EXT: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/mp4": "m4a", "audio/aac": "m4a" };
const REC = "library.json";
const NEXT = "library.json.new";
const AUDIO_NAME = /^[0-9a-f-]{36}\.[0-9a-f]{8}\.(mp3|wav|m4a)$/;

/** The file extension for a recording; players choose a decoder by it. */
export function extFor(mime: string): string {
  return EXT[mime.split(";")[0].trim().toLowerCase()] ?? "mp3";
}
const isJson = (s: string | null): s is string => {
  try {
    return s !== null && typeof JSON.parse(s) === "object";
  } catch {
    return false;
  }
};

type Doc = { lib: Library; audio: Record<string, string> };

export function makeFileLibrary(files: LibraryFiles): DeviceLibrary {
  const listeners = new Set<() => void>();
  // library.json is removed only once library.json.new is complete, so with no library.json a
  // complete .new file is the library. A half-written .new is a first save that never finished.
  const readRaw = async () => {
    const cur = await files.read(REC);
    if (cur !== null) return cur;
    const next = await files.read(NEXT);
    return isJson(next) ? next : null;
  };
  // Records that exist but cannot be read are an error, never "empty": a change built on an
  // empty library would overwrite every other item.
  const readStrict = async (): Promise<Doc> => {
    try {
      const raw = await readRaw();
      const parsed = raw === null ? null : (JSON.parse(raw) as { manifestations?: unknown; audioFiles?: unknown });
      if (parsed !== null && !Array.isArray(parsed?.manifestations)) throw new Error("not a library");
      const audio: Record<string, string> = {};
      for (const [id, name] of Object.entries(parsed?.audioFiles ?? {})) {
        // A name becomes a path, so only names this store makes are accepted.
        if (isUuid(id) && typeof name === "string" && AUDIO_NAME.test(name) && name.startsWith(`${id}.`)) audio[id] = name;
      }
      return { lib: parseLibrary(parsed), audio };
    } catch {
      throw new Error("Your library could not be read, so nothing was changed. Try again.");
    }
  };
  // For showing the list only: an unreadable library shows as empty and is left untouched.
  const read = (): Promise<Doc> => readStrict().catch(() => ({ lib: parseLibrary(null), audio: {} }));
  // Replaces the records in one step. At every moment one complete copy is on the device.
  const write = async ({ lib, audio }: Doc) => {
    if ((await files.read(REC)) === null && isJson(await files.read(NEXT))) await files.move(NEXT, REC);
    await files.write(NEXT, JSON.stringify({ ...lib, audioFiles: audio }));
    await files.remove(REC);
    await files.move(NEXT, REC);
    listeners.forEach((fn) => fn());
  };
  const drop = (name: string | undefined) => (name ? files.remove(name).catch(() => undefined) : undefined);
  // One change at a time: each reads the records, then writes them, so two at once would lose one.
  let tail: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };
  // Once per start: removes recordings the records do not name. A save or delete that was cut
  // short leaves one behind. Nothing is removed while the records cannot be read.
  let swept: Promise<void> | null = null;
  const tidy = () =>
    (swept ??= inTurn(async () => {
      const keep = new Set(Object.values((await readStrict()).audio));
      for (const n of await files.list()) if (AUDIO_NAME.test(n) && !keep.has(n)) await drop(n);
    }).catch(() => undefined));
  const change = <T>(fn: () => Promise<T>) => tidy().then(() => inTurn(fn));
  const load = async () => (await tidy(), (await read()).lib);
  return {
    load,
    get: async (id) => (await load()).manifestations.find((m) => m.id === id) ?? null,
    save: (m: Manifestation, audio?: AudioBytes | null) => change(async () => {
      // An id becomes part of a file name, so only the id format the app itself makes is accepted.
      if (!isUuid(m.id)) throw new Error("That item has an id this device cannot store.");
      const doc = await readStrict();
      const old = doc.audio[m.id];
      const names = { ...doc.audio };
      // Order matters. The new recording is written under a new name, then the records are written
      // to name it, and only then is the old file removed. Stopping at any step leaves the records
      // naming a whole recording.
      const fresh = audio ? `${m.id}.${newId().slice(0, 8)}.${extFor(audio.mime)}` : undefined;
      if (fresh) names[m.id] = fresh;
      else if (audio === null) delete names[m.id];
      const next = { ...m, hasAudio: m.id in names };
      const known = doc.lib.manifestations.some((x) => x.id === m.id);
      const lib = { ...doc.lib, manifestations: known ? doc.lib.manifestations.map((x) => (x.id === m.id ? next : x)) : [next, ...doc.lib.manifestations] };
      try {
        if (fresh && audio) await files.write(fresh, audio.bytes);
        await write({ lib, audio: names });
      } catch (e) {
        // The records write can fail after the new records are already the ones on the device.
        // The new file goes only when the records are readable and do not name it.
        const now = await readStrict().catch(() => null);
        if (now && now.audio[m.id] !== fresh) await drop(fresh);
        throw e;
      }
      if (audio !== undefined) await drop(old);
    }),
    remove: (id) => change(async () => {
      const doc = await readStrict();
      const { [id]: old, ...audio } = doc.audio;
      await write({ lib: withoutManifestation(doc.lib, id), audio });
      await drop(old);
    }),
    async audioUri(id) {
      await tidy();
      const name = (await read()).audio[id];
      return name ? files.uri(name) : null;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}

/** One address per recording, so asking again does not pin another copy in memory. */
export function makeUrlCache(getAudio: (id: string) => Promise<Blob | null>, urlApi: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL) {
  const urls = new Map<string, string>();
  let changes = 0;
  const forget = (id: string) => {
    const u = urls.get(id);
    if (u) urlApi.revokeObjectURL(u);
    urls.delete(id);
  };
  return {
    forget: (id: string) => (changes++, forget(id)),
    /** Call when the recordings may have changed elsewhere: another tab, or the website. */
    clear() {
      changes++; // also stops a read that is under way from keeping the copy it finds
      [...urls.keys()].forEach(forget);
    },
    async uri(id: string): Promise<string | null> {
      for (;;) {
        const known = urls.get(id);
        if (known) return known;
        const seen = changes;
        const b = await getAudio(id);
        if (seen !== changes) continue; // changed while reading: this copy may be the old one
        if (!b) return null;
        const url = urlApi.createObjectURL(b);
        urls.set(id, url);
        return url;
      }
    },
  };
}
