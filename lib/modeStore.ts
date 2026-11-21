// Browser-only: the chosen mode, and applying a mode to the stored settings.
import { writePaceChoice, writeToneChoice } from "@/lib/deliveryStore";
import { resolveMode, type Mode, type ModeId } from "@/lib/modes";
import { writeMusicChoice, writeMusicVolume } from "@/lib/musicStore";
import { readMixOn, writeMixOn } from "@/lib/voiceMixStore";
import { VOICE_STORAGE_KEY, readVoiceChoice, writeVoiceChoice } from "@/lib/voiceStore";

export const MODE_STORAGE_KEY = "nv_mode";
/** The voice and Mix setting from before a mode with its own voice, so leaving that mode puts them back. */
const SAVED_KEY = "nv_mode_saved_voice";
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
  ok = applyModeVoice(m) && ok;
  window.dispatchEvent(new Event(MODE_CHANGED));
  return ok;
}

type Saved = { voice: string | null; mixOn: boolean; modeVoice: string };

function readSaved(): Saved | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? "null");
    return v && typeof v.modeVoice === "string" ? v : null;
  } catch {
    return null;
  }
}

/**
 * A mode with its own voice records in it with Mix voices off. The listener's own
 * voice and Mix setting are kept aside first and put back when they switch to a
 * mode without one, unless they changed them meanwhile.
 */
function applyModeVoice(m: Mode): boolean {
  const saved = readSaved();
  try {
    if (m.voiceId) {
      if (!saved) {
        const keep: Saved = { voice: readVoiceChoice(), mixOn: readMixOn(), modeVoice: m.voiceId };
        window.localStorage.setItem(SAVED_KEY, JSON.stringify(keep));
      }
      return writeVoiceChoice(m.voiceId) && writeMixOn(false);
    }
    if (!saved) return true;
    window.localStorage.removeItem(SAVED_KEY);
    let ok = true;
    // Only undo what the mode changed: a voice or Mix setting picked since then stays.
    if (readVoiceChoice() === saved.modeVoice) {
      if (saved.voice) ok = writeVoiceChoice(saved.voice) && ok;
      else window.localStorage.removeItem(VOICE_STORAGE_KEY);
    }
    if (saved.mixOn && !readMixOn()) ok = writeMixOn(true) && ok;
    return ok;
  } catch {
    return false;
  }
}
