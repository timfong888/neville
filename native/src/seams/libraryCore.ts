// The phone's library store, written against a tiny file interface so the repo's unit tests can run it.
// Framework-free. Records are one JSON document; each recording is one file named by the item id.
import { type Library, type Manifestation, isUuid, parseLibrary, withoutManifestation } from "@/lib/library/model";
import type { AudioBytes, DeviceLibrary } from "./library.types";

/** What the store needs from the device. Audio files are found by item id. */
export type LibraryFiles = {
  readRecords(): Promise<string | null>;
  /** Throws when the device is full; callers show the error. */
  writeRecords(json: string): Promise<void>;
  writeAudio(id: string, audio: AudioBytes): Promise<void>;
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
  const read = async (): Promise<Library> => {
    try {
      const raw = await files.readRecords();
      return parseLibrary(raw ? JSON.parse(raw) : null);
    } catch {
      return parseLibrary(null);
    }
  };
  const write = async (lib: Library) => {
    await files.writeRecords(JSON.stringify(lib));
    listeners.forEach((fn) => fn());
  };
  // An id becomes a file name, so only the id format the app itself makes is accepted.
  const check = (id: string) => {
    if (!isUuid(id)) throw new Error("That item has an id this device cannot store.");
  };
  return {
    load: read,
    async get(id) {
      return (await read()).manifestations.find((m) => m.id === id) ?? null;
    },
    async save(m: Manifestation, audio?: AudioBytes | null) {
      check(m.id);
      const lib = await read();
      const old = lib.manifestations.find((x) => x.id === m.id);
      let hasAudio = old?.hasAudio ?? false;
      if (audio === null) {
        await files.deleteAudio(m.id).catch(() => undefined);
        hasAudio = false;
      } else if (audio) {
        // Clear first: a new recording may have another extension than the old one.
        await files.deleteAudio(m.id).catch(() => undefined);
        await files.writeAudio(m.id, audio);
        hasAudio = true;
      }
      const next = { ...m, hasAudio };
      await write({ ...lib, manifestations: old ? lib.manifestations.map((x) => (x.id === m.id ? next : x)) : [next, ...lib.manifestations] });
    },
    async remove(id) {
      if (isUuid(id)) await files.deleteAudio(id).catch(() => undefined);
      await write(withoutManifestation(await read(), id));
    },
    async audioSrc(id) {
      return isUuid(id) ? files.audioUri(id) : null;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}
