// Browser-only: where the web app keeps the music choice and its volume.
import { DEFAULT_MUSIC_VOLUME, resolveMusic, type MusicChoice } from "@/lib/music";

export const MUSIC_STORAGE_KEY = "nv_music";
export const MUSIC_VOLUME_STORAGE_KEY = "nv_music_volume";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, v: string): boolean {
  try {
    window.localStorage.setItem(key, v);
    return true;
  } catch {
    return false;
  }
}

export const readMusicChoice = (): MusicChoice => resolveMusic(read(MUSIC_STORAGE_KEY));
export const writeMusicChoice = (id: MusicChoice): boolean => write(MUSIC_STORAGE_KEY, id);

export function readMusicVolume(): number {
  const raw = read(MUSIC_VOLUME_STORAGE_KEY);
  const v = raw === null ? NaN : Number(raw);
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : DEFAULT_MUSIC_VOLUME;
}
export const writeMusicVolume = (v: number): boolean => write(MUSIC_VOLUME_STORAGE_KEY, String(Math.round(v * 100) / 100));
