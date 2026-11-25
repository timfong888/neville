import type { Library, Manifestation } from "@/lib/library/model";

/** A recording as bytes, as `api.manifest()` returns it (`new Uint8Array(recording.audio)`). */
export type AudioBytes = { bytes: Uint8Array; mime: string };

/**
 * The library saved on this device. Web: the website's own store (localStorage and IndexedDB).
 * Phone: files in the app's documents folder. Screens import `library` from "./library" only.
 */
export interface DeviceLibrary {
  load(): Promise<Library>;
  get(id: string): Promise<Manifestation | null>;
  /** Adds or replaces. `audio` left out keeps the stored recording; `null` removes it. Sets `hasAudio` itself. */
  save(m: Manifestation, audio?: AudioBytes | null): Promise<void>;
  remove(id: string): Promise<void>;
  /** An address a player can open: a file URI on a phone, an object URL on the web. Null with no recording. */
  audioUri(id: string): Promise<string | null>;
  /** Calls `fn` after every change. Returns the unsubscribe. */
  subscribe(fn: () => void): () => void;
}
