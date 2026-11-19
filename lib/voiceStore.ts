// Browser-only: where the web app keeps the chosen voice. A native app would
// keep the same id in its own storage.

/** Where the choice is kept on the device. */
export const VOICE_STORAGE_KEY = "nv_voice";


export function readVoiceChoice(): string | null {
  try {
    return window.localStorage.getItem(VOICE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Returns false when the device refuses storage (private mode). */
export function writeVoiceChoice(id: string): boolean {
  try {
    window.localStorage.setItem(VOICE_STORAGE_KEY, id);
    return true;
  } catch {
    return false;
  }
}
