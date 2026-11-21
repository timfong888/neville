// Browser-only: where the web app keeps the chosen pace and tone. A native app
// would keep the same ids in its own storage. The ids are checked against the
// presets in lib/delivery.ts, both here and again on the server.
import { resolvePace, resolveTone, type PaceId, type ToneId } from "@/lib/delivery";

export const PACE_STORAGE_KEY = "nv_pace";
export const TONE_STORAGE_KEY = "nv_tone";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, id: string): boolean {
  try {
    window.localStorage.setItem(key, id);
    return true;
  } catch {
    return false;
  }
}

/** The stored pace; the default when nothing valid is stored. */
export const readPaceChoice = (): PaceId => resolvePace(read(PACE_STORAGE_KEY)).id;
export const readToneChoice = (): ToneId => resolveTone(read(TONE_STORAGE_KEY)).id;

/** Each returns false when the device refuses storage (private mode). */
export const writePaceChoice = (id: PaceId): boolean => write(PACE_STORAGE_KEY, id);
export const writeToneChoice = (id: ToneId): boolean => write(TONE_STORAGE_KEY, id);
