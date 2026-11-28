// The chosen voice, pace and tone. Framework-free, so the repo's unit tests can run it.
// Voice id is stored and returned as-is; the server validates it on every request.
import { resolvePace, resolveTone, type PaceId, type ToneId } from "@/lib/delivery";
import { DEFAULT_CADENCE_STEP, DEFAULT_SPEED_STEP, resolveCadence, resolveSpeed, type CadenceStep, type SpeedStep } from "@/lib/voice/options";
import type { KV } from "./kv.types";

/** The website's keys, so a choice made there is the choice here. */
export const SETTINGS_KEYS = {
  voiceId: "nv_voice",
  pace: "nv_pace",
  tone: "nv_tone",
  speedStep: "nv_speed_step",
  cadenceStep: "nv_cadence_step",
} as const;

export type Settings = { voiceId: string | null; pace: PaceId; tone: ToneId; speedStep: SpeedStep; cadenceStep: CadenceStep };

export function makeSettingsStore(kv: KV) {
  const listeners = new Set<() => void>();
  return {
    /** Stored choices; the default for anything missing, unknown or no longer offered. */
    async read(): Promise<Settings> {
      const [v, p, t, sp, ca] = await Promise.all([
        kv.get(SETTINGS_KEYS.voiceId),
        kv.get(SETTINGS_KEYS.pace),
        kv.get(SETTINGS_KEYS.tone),
        kv.get(SETTINGS_KEYS.speedStep),
        kv.get(SETTINGS_KEYS.cadenceStep),
      ]);
      return {
        voiceId: v ?? null,
        pace: resolvePace(p).id,
        tone: resolveTone(t).id,
        speedStep: resolveSpeed(sp).id,
        cadenceStep: resolveCadence(ca).id,
      };
    },
    /** Saves the given choices. False when the device refused any of them. */
    async write(patch: Partial<Settings>): Promise<boolean> {
      const keys = (Object.keys(SETTINGS_KEYS) as (keyof Settings)[]).filter((k) => patch[k] !== undefined);
      const ok = await Promise.all(keys.map((k) => kv.set(SETTINGS_KEYS[k], String(patch[k]))));
      listeners.forEach((fn) => fn());
      return ok.every(Boolean);
    },
    /** Calls `fn` after every write. Returns the unsubscribe. */
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}

export type SettingsStore = ReturnType<typeof makeSettingsStore>;
