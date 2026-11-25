// The phone's library store, written against a tiny file interface so the repo's unit tests can run it.
// Framework-free. Records are one JSON document; each recording is one file named by the item id.
import { type Library, type Manifestation, isUuid, parseLibrary, withoutManifestation } from "@/lib/library/model";
import type { AudioBytes, DeviceLibrary } from "./library.types";

/** What the store needs from the device. Audio files are found by item id. */
export type LibraryFiles = {
  readRecords(): Promise<string | null>;
  /** Replaces the records in one step: a failure must leave the earlier records readable. Throws when the device is full. */
  writeRecords(json: string): Promise<void>;
  /** Writes a new recording beside the current one, without touching it. Throws when the device is full. */
  stageAudio(id: string, audio: AudioBytes): Promise<void>;
  /** Makes the staged recording the current one. */
  commitAudio(id: string): Promise<void>;
  /** Drops a staged recording that will not be used. */
  discardStaged(id: string): Promise<void>;
  deleteAudio(id: string): Promise<void>;
  audioUri(id: string): Promise<string | null>;
};

const EXT: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/mp4": "m4a", "audio/aac": "m4a" };
export const AUDIO_EXTS = ["mp3", "wav", "m4a"] as const;

/** The file extension for a recording; players choose a decoder by it. */
export function extFor(mime: string): (typeof AUDIO_EXTS)[number] {
  return (EXT[mime.split(";")[0].trim().toLowerCase()] ?? "mp3") as (typeof AUDIO_EXTS)[number];
}

export function makeFileLibrary(files: LibraryFiles): DeviceLibrary {
  const listeners = new Set<() => void>();
  // Records that exist but cannot be read are an error, never "empty": a change built on an
  // empty library would overwrite every other item.
  const readStrict = async (): Promise<Library> => {
    let raw: string | null;
    let parsed: unknown = null;
    try {
      raw = await files.readRecords();
      if (raw) parsed = JSON.parse(raw);
    } catch {
      throw new Error("Your library could not be read, so nothing was changed. Try again.");
    }
    return parseLibrary(parsed);
  };
  // For showing the list only: an unreadable library shows as empty and is left untouched.
  const read = (): Promise<Library> => readStrict().catch(() => parseLibrary(null));
  const write = async (lib: Library) => {
    await files.writeRecords(JSON.stringify(lib));
    listeners.forEach((fn) => fn());
  };
  // An id becomes a file name, so only the id format the app itself makes is accepted.
  // One change at a time: each reads the records, then writes them, so two at once would lose one.
  let tail: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };
  const check = (id: string) => {
    if (!isUuid(id)) throw new Error("That item has an id this device cannot store.");
  };
  return {
    load: read,
    async get(id) {
      return (await read()).manifestations.find((m) => m.id === id) ?? null;
    },
    save: (m: Manifestation, audio?: AudioBytes | null) => inTurn(async () => {
      check(m.id);
      const lib = await readStrict();
      const old = lib.manifestations.find((x) => x.id === m.id);
      const next = { ...m, hasAudio: audio === null ? false : audio ? true : (old?.hasAudio ?? false) };
      const records = { ...lib, manifestations: old ? lib.manifestations.map((x) => (x.id === m.id ? next : x)) : [next, ...lib.manifestations] };
      // Order matters. The new recording is staged, the records are written, and only then is the
      // old recording replaced or removed. A failure at any step leaves the old item whole.
      if (audio) await files.stageAudio(m.id, audio);
      try {
        await write(records);
      } catch (e) {
        if (audio) await files.discardStaged(m.id).catch(() => undefined);
        throw e;
      }
      if (audio) await files.commitAudio(m.id);
      else if (audio === null) await files.deleteAudio(m.id).catch(() => undefined);
    }),
    remove: (id) => inTurn(async () => {
      await write(withoutManifestation(await readStrict(), id));
      if (isUuid(id)) await files.deleteAudio(id).catch(() => undefined);
    }),
    async audioUri(id) {
      return isUuid(id) ? files.audioUri(id) : null;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}
