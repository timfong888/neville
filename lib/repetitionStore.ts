// Browser-only: where the web app keeps the programming-mode choices (#77).
import { DEFAULT_REPEAT_MINUTES, clampMinutes } from "@/lib/repetition";

export const REPEAT_STORAGE_KEY = "nv_repeat_min";
export const BELL_STORAGE_KEY = "nv_repeat_bell";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Minutes of repetition; 0 is off. */
export const readRepeatMinutes = (): number => {
  const v = read(REPEAT_STORAGE_KEY);
  return v === null ? DEFAULT_REPEAT_MINUTES : clampMinutes(Number(v));
};
export const writeRepeatMinutes = (n: number): boolean => write(REPEAT_STORAGE_KEY, String(clampMinutes(n)));

/** The bell between repetitions; on unless turned off. */
export const readBellOn = (): boolean => read(BELL_STORAGE_KEY) !== "0";
export const writeBellOn = (on: boolean): boolean => write(BELL_STORAGE_KEY, on ? "1" : "0");
