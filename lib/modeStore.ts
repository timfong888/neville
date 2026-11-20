// Browser-only: the chosen mode, and applying a mode to the stored settings.
import { writePaceChoice, writeToneChoice } from "@/lib/deliveryStore";
import { resolveMode, type Mode, type ModeId } from "@/lib/modes";
import { writeMusicChoice, writeMusicVolume } from "@/lib/musicStore";

export const MODE_STORAGE_KEY = "nv_mode";
/** Fired on window when a mode is applied, so open pickers re-read their settings. */
export const MODE_CHANGED = "nv-mode-changed";

export function readMode(): Mode {
  try {
    return resolveMode(window.localStorage.getItem(MODE_STORAGE_KEY));
  } catch {
    return resolveMode(null);
  }
}

/** Writes the mode and every setting it presets. False if this browser will not store it. */
export function applyMode(id: ModeId): boolean {
  const m = resolveMode(id);
  let ok = true;
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, m.id);
  } catch {
    ok = false;
  }
  ok = writePaceChoice(m.pace) && ok;
  ok = writeToneChoice(m.tone) && ok;
  ok = writeMusicChoice(m.music) && ok;
  ok = writeMusicVolume(m.volume) && ok;
  window.dispatchEvent(new Event(MODE_CHANGED));
  return ok;
}
