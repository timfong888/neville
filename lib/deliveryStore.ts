// Browser-only: where the web app keeps the chosen pace, tone, speed step and cadence step.
// A native app would keep the same ids in its own storage. The ids are checked against the
// presets in lib/delivery.ts and lib/voice/options.ts, both here and again on the server.
import { resolvePace, resolveTone, type PaceId, type ToneId } from "@/lib/delivery";
import { DEFAULT_CADENCE_STEP, DEFAULT_SPEED_STEP, resolveCadence, resolveSpeed, type CadenceStep, type SpeedStep } from "@/lib/voice/options";

export const PACE_STORAGE_KEY = "nv_pace";
export const TONE_STORAGE_KEY = "nv_tone";
export const SPEED_STEP_KEY = "nv_speed_step";
export const CADENCE_STEP_KEY = "nv_cadence_step";

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
export const readSpeedStepChoice = (): SpeedStep => resolveSpeed(read(SPEED_STEP_KEY) ?? DEFAULT_SPEED_STEP).id;
export const readCadenceStepChoice = (): CadenceStep => resolveCadence(read(CADENCE_STEP_KEY) ?? DEFAULT_CADENCE_STEP).id;

/** Each returns false when the device refuses storage (private mode). */
export const writePaceChoice = (id: PaceId): boolean => write(PACE_STORAGE_KEY, id);
export const writeToneChoice = (id: ToneId): boolean => write(TONE_STORAGE_KEY, id);
export const writeSpeedStepChoice = (id: SpeedStep): boolean => write(SPEED_STEP_KEY, id);
export const writeCadenceStepChoice = (id: CadenceStep): boolean => write(CADENCE_STEP_KEY, id);
