// The one interface the library pages use. Today the only implementation is
// the device store below; the account store (issue #13) implements the same
// interface against the server, so the pages do not change.
import {
  EMPTY_LIBRARY,
  type Library,
  type Manifestation,
  type Playlist,
  parseLibrary,
  withoutManifestation,
} from "@/lib/library/model";

export interface LibraryStore {
  /** Where the data lives, for the copy shown to people. */
  readonly kind: "device" | "account";
  load(): Promise<Library>;
  saveManifestation(m: Manifestation, audio?: Blob | null): Promise<void>;
  /** Replaces the record. `audio: null` removes the stored recording. */
  updateManifestation(m: Manifestation, audio?: Blob | null): Promise<void>;
  deleteManifestation(id: string): Promise<void>;
  getAudio(id: string): Promise<Blob | null>;
  savePlaylist(p: Playlist): Promise<void>;
  deletePlaylist(id: string): Promise<void>;
}

const KEY = "nv_library_v1";
const DB = "neville";
const AUDIO = "audio";

/** Fires on this tab whenever the library changes, so open views refresh. */
export const CHANGED = "nv-library-changed";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no IndexedDB"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(AUDIO);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function audioOp<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(AUDIO, mode);
      const req = run(tx.objectStore(AUDIO));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Records in localStorage, recordings in IndexedDB. Everything stays in this
 * browser: clearing site data removes it, and other devices do not see it.
 */
export class DeviceStore implements LibraryStore {
  readonly kind = "device" as const;

  private read(): Library {
    try {
      const raw = window.localStorage.getItem(KEY);
      return raw ? parseLibrary(JSON.parse(raw)) : EMPTY_LIBRARY;
    } catch {
      return EMPTY_LIBRARY;
    }
  }

  private write(lib: Library) {
    // Throws when storage is full or blocked; callers show the error.
    window.localStorage.setItem(KEY, JSON.stringify(lib));
    window.dispatchEvent(new Event(CHANGED));
  }

  async load(): Promise<Library> {
    return this.read();
  }

  async saveManifestation(m: Manifestation, audio?: Blob | null): Promise<void> {
    let hasAudio = false;
    if (audio) {
      try {
        await audioOp("readwrite", (s) => s.put(audio, m.id));
        hasAudio = true;
      } catch {
        // No IndexedDB (some private windows): keep the script; the device voice reads it.
      }
    }
    const lib = this.read();
    this.write({ ...lib, manifestations: [{ ...m, hasAudio }, ...lib.manifestations.filter((x) => x.id !== m.id)] });
  }

  async updateManifestation(m: Manifestation, audio?: Blob | null): Promise<void> {
    let hasAudio = m.hasAudio;
    if (audio === null) {
      await audioOp("readwrite", (s) => s.delete(m.id)).catch(() => undefined);
      hasAudio = false;
    } else if (audio) {
      await audioOp("readwrite", (s) => s.put(audio, m.id));
      hasAudio = true;
    }
    const lib = this.read();
    this.write({ ...lib, manifestations: lib.manifestations.map((x) => (x.id === m.id ? { ...m, hasAudio } : x)) });
  }

  async deleteManifestation(id: string): Promise<void> {
    await audioOp("readwrite", (s) => s.delete(id)).catch(() => undefined);
    this.write(withoutManifestation(this.read(), id));
  }

  async getAudio(id: string): Promise<Blob | null> {
    try {
      const b = await audioOp<unknown>("readonly", (s) => s.get(id));
      return b instanceof Blob ? b : null;
    } catch {
      return null;
    }
  }

  async savePlaylist(p: Playlist): Promise<void> {
    const lib = this.read();
    const exists = lib.playlists.some((x) => x.id === p.id);
    this.write({
      ...lib,
      playlists: exists ? lib.playlists.map((x) => (x.id === p.id ? p : x)) : [...lib.playlists, p],
    });
  }

  async deletePlaylist(id: string): Promise<void> {
    const lib = this.read();
    this.write({ ...lib, playlists: lib.playlists.filter((x) => x.id !== id) });
  }
}
