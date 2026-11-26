// Background music under a loop (#163). Framework-free. The tracks, the volume curve and the dip under
// speech come from the website's lib/music.ts, so a track sounds the same on both.
//
// Off by default, and the whole feature is behind a build flag (EXPO_PUBLIC_MUSIC=1) until it has been
// heard on a device: whether a second player mixes with the voice under `doNotMix` is not proven.
import { DEFAULT_MUSIC_VOLUME, DUCK_GAIN, MUSIC_TRACKS, type MusicChoice, musicGain } from "@/lib/music";
import type { KV } from "../seams/kv.types";
import type { Track } from "./musicPlayer";

/** The website's keys, so a choice made there is the choice here. */
export const MUSIC_KEY = "nv_music";
export const MUSIC_VOLUME_KEY = "nv_music_volume";

export type MusicSettings = { choice: MusicChoice; volume: number };
/** What should sound under a session: the track and the level (see musicPlayer.ts). */
export type Music = Track;

/** Unlike the website, which opens on a track, the phone opens on Off. */
export const parseMusic = (v: string | null | undefined): MusicChoice => MUSIC_TRACKS.find((t) => t.id === v)?.id ?? "none";

export function parseVolume(v: string | null | undefined): number {
  const n = v === null || v === undefined || v.trim() === "" ? Number.NaN : Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : DEFAULT_MUSIC_VOLUME;
}

export const musicEnabled = (flag: string | undefined) => flag === "1";

export function makeMusicStore(kv: KV) {
  const listeners = new Set<() => void>();
  // The latest settings, kept here and not only on the device, so a read right after a tap sees the tap (#184).
  // One load serves every caller waiting on it, so they carry on in the order they asked.
  let live: MusicSettings | null = null;
  let loading: Promise<void> | null = null;
  const ready = async (): Promise<MusicSettings> => {
    loading ??= Promise.all([kv.get(MUSIC_KEY), kv.get(MUSIC_VOLUME_KEY)]).then(([c, v]) => {
      live ??= { choice: parseMusic(c), volume: parseVolume(v) };
    });
    await loading;
    return live as MusicSettings;
  };
  return {
    read: ready,
    /** False when the device refused a write. The new choice is in force at once either way. */
    async write(patch: Partial<MusicSettings>): Promise<boolean> {
      const base = await ready();
      const next = { ...base };
      if (patch.choice !== undefined) next.choice = patch.choice;
      if (patch.volume !== undefined) next.volume = patch.volume;
      live = next;
      listeners.forEach((fn) => fn());
      const ok = await Promise.all([
        patch.choice === undefined ? true : kv.set(MUSIC_KEY, patch.choice),
        patch.volume === undefined ? true : kv.set(MUSIC_VOLUME_KEY, String(patch.volume)),
      ]);
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
  return gain > 0 ? { id: s.choice, src: src(s.choice), volume: gain * DUCK_GAIN } : undefined;
}

/**
 * Feeds every change of the stored choice to the one music player, so it takes effect while a session plays (#184).
 * Each change is read back and only the newest reading is used. Returns the way to stop.
 */
export function bindMusic(
  store: Pick<ReturnType<typeof makeMusicStore>, "read" | "subscribe">,
  set: (m: Music | undefined) => void,
  enabled: boolean,
  src: (id: Exclude<MusicChoice, "none">) => string | number,
): () => void {
  if (!enabled) return () => undefined;
  let latest = 0;
  const sync = () => {
    const mine = ++latest;
    void store.read().then((s) => mine === latest && set(musicFor(s, true, src)));
  };
  sync();
  const off = store.subscribe(sync);
  return () => {
    latest++;
    off();
  };
}
