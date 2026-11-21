// Browser-only: whether Mix voices is on, which voices, and where the rotation is.
import { cleanMix, mixVoiceAt } from "@/lib/voiceMix";

const ON = "nv_mix_on";
const SET = "nv_mix_voices";
const NEXT = "nv_mix_next";

function get(k: string): string | null {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}
function set(k: string, v: string): boolean {
  try {
    window.localStorage.setItem(k, v);
    return true;
  } catch {
    return false;
  }
}

export const readMixOn = (): boolean => get(ON) === "1";
export const writeMixOn = (on: boolean): boolean => set(ON, on ? "1" : "0");

export function readMix(): string[] {
  try {
    return cleanMix(JSON.parse(get(SET) ?? "null"));
  } catch {
    return cleanMix(null);
  }
}
export const writeMix = (ids: string[]): boolean => set(SET, JSON.stringify(cleanMix(ids)));

const nextIndex = (): number => Number(get(NEXT) ?? "0") || 0;

/** The voice for the next recording. The rotation moves on only via advanceMix, once a recording is made. */
export const peekMixVoice = (): string => mixVoiceAt(readMix(), nextIndex());

/** Moves the rotation on after a recording was actually made, so a failed one does not use up a voice's turn. */
export const advanceMix = (): boolean => set(NEXT, String(nextIndex() + 1));
