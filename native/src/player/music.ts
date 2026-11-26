// Background music under a loop (#163). Framework-free. The tracks, the volume curve and the dip under
// speech come from the website's lib/music.ts, so a track sounds the same on both.
//
// Off by default, and the whole feature is behind a build flag (EXPO_PUBLIC_MUSIC=1) until it has been
// heard on a device: whether a second player mixes with the voice under `doNotMix` is not proven.
import { DEFAULT_MUSIC_VOLUME, DUCK_GAIN, MUSIC_TRACKS, type MusicChoice, musicGain } from "@/lib/music";
import type { KV } from "../seams/kv.types";

/** The website's keys, so a choice made there is the choice here. */
export const MUSIC_KEY = "nv_music";
export const MUSIC_VOLUME_KEY = "nv_music_volume";

export type MusicSettings = { choice: MusicChoice; volume: number };
export type Music = { src: string | number; volume: number };

/** Unlike the website, which opens on a track, the phone opens on Off. */
export const parseMusic = (v: string | null | undefined): MusicChoice => MUSIC_TRACKS.find((t) => t.id === v)?.id ?? "none";

export function parseVolume(v: string | null | undefined): number {
  const n = v === null || v === undefined || v.trim() === "" ? Number.NaN : Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : DEFAULT_MUSIC_VOLUME;
}

export const musicEnabled = (flag: string | undefined) => flag === "1";

export function makeMusicStore(kv: KV) {
  const listeners = new Set<() => void>();
  return {
    async read(): Promise<MusicSettings> {
      const [c, v] = await Promise.all([kv.get(MUSIC_KEY), kv.get(MUSIC_VOLUME_KEY)]);
      return { choice: parseMusic(c), volume: parseVolume(v) };
    },
    /** False when the device refused a write. */
    async write(patch: Partial<MusicSettings>): Promise<boolean> {
      const ok = await Promise.all([
        patch.choice === undefined ? true : kv.set(MUSIC_KEY, patch.choice),
        patch.volume === undefined ? true : kv.set(MUSIC_VOLUME_KEY, String(patch.volume)),
      ]);
      listeners.forEach((fn) => fn());
      return ok.every(Boolean);
    },
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}

/**
 * The music a session should open with, or nothing. The level is the slider's gain at the dip under speech:
 * a phone cannot follow the voice's loudness, so the track sits where the website puts it while the voice speaks.
 */
export function musicFor(s: MusicSettings, enabled: boolean, src: (id: Exclude<MusicChoice, "none">) => string | number): Music | undefined {
  if (!enabled || s.choice === "none") return undefined;
  const gain = musicGain(s.volume);
  return gain > 0 ? { src: src(s.choice), volume: gain * DUCK_GAIN } : undefined;
}
