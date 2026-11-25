// The chosen voice, pace and tone. Framework-free, so the repo's unit tests can run it.
// Ids are checked against lib/voices.ts and lib/delivery.ts on every read; the server checks again.
import { resolvePace, resolveTone, type PaceId, type ToneId } from "@/lib/delivery";
import { resolveVoice } from "@/lib/voices";
import type { KV } from "./kv.types";

/** The website's keys, so a choice made there is the choice here. */
export const SETTINGS_KEYS = { voiceId: "nv_voice", pace: "nv_pace", tone: "nv_tone" } as const;

export type Settings = { voiceId: string; pace: PaceId; tone: ToneId };

export function makeSettingsStore(kv: KV) {
  const listeners = new Set<() => void>();
  return {
    /** Stored choices; the default for anything missing, unknown or no longer offered. */
    async read(): Promise<Settings> {
      const [v, p, t] = await Promise.all([kv.get(SETTINGS_KEYS.voiceId), kv.get(SETTINGS_KEYS.pace), kv.get(SETTINGS_KEYS.tone)]);
      return { voiceId: resolveVoice(v).id, pace: resolvePace(p).id, tone: resolveTone(t).id };
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
