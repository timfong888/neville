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

/** The voice for the next recording, and moves the rotation on. */
export function takeMixVoice(): string {
  const n = Number(get(NEXT) ?? "0") || 0;
  set(NEXT, String(n + 1));
  return mixVoiceAt(readMix(), n);
}
