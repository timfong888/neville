// The four platform seams. Each has a `.native.ts` and a `.web.ts` file next to a
// plain `.ts` that re-exports the native one (for the type checker; Metro picks
// the platform file). They live outside `app/` because Expo Router only allows
// platform files inside the routes folder when a non-platform version exists.
import type { Library, Manifestation, Playlist } from "@/lib/library/model";

/** What the app needs from the platform's audio. */
export interface AudioSeam {
  /** Background playback and lock-screen mode. A no-op on the web. */
  configure(): Promise<void>;
  /** Writes audio bytes somewhere the player can read; returns its address. */
  save(name: string, bytes: Uint8Array, mime: string): Promise<string>;
  /** Plays one source. `loop` repeats it. */
  play(src: string, o?: { loop?: boolean; title?: string }): PlayHandle;
  /** Plays the sources in order, repeating the whole list: native sequencing is gapless. */
  playSequence(srcs: string[], o?: { title?: string }): PlayHandle;
}
export type PlayHandle = { stop(): void };

/** Small key-value settings (voice, pace, tone). Async because native storage is. */
export interface KvSeam {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** The saved library. Recordings are addressed by URI so a player can open them on either platform. */
export interface LibrarySeam {
  load(): Promise<Library>;
  save(m: Manifestation, audio?: ArrayBuffer | null): Promise<void>;
  remove(id: string): Promise<void>;
  /** A URI the audio seam can play, or null when there is no recording. */
  audioUri(id: string): Promise<string | null>;
  savePlaylist(p: Playlist): Promise<void>;
  deletePlaylist(id: string): Promise<void>;
}

export type AppleResult = { ok: true } | { ok: false; cancelled: boolean; message: string };

/** Sign-in and the session. Native keeps a cookie in the keychain; the web uses the browser's own cookie. */
export interface AuthSeam {
  /** Extra headers our own API calls need: the cookie and Origin on a phone, nothing on the web. */
  sessionHeaders(): Promise<Record<string, string>>;
  signInWithApple(): Promise<AppleResult>;
  signOut(): Promise<void>;
}
