// The voices people can choose in Settings. The list and the default live in
// config/voices.json so they can change without touching code. A mistake in
// that file fails the build here, before it can reach the live site.

import config from "@/config/voices.json";

export type Tier = "free" | "cheap" | "low" | "mid" | "premium";

export type Voice = {
  /** Stable id stored on the device. Do not reuse an id for a different voice. */
  id: string;
  provider: string;
  /** OpenRouter model id. */
  model: string;
  /** The voice name the model expects. Empty means the model's own default voice. */
  voice: string;
  /** Name shown to people. */
  name: string;
  /** One or two words on how it sounds. May be empty. */
  label: string;
  /** A pre-made clip under /public. Playing it costs nothing. */
  sample: string;
  /** Only enabled voices are offered or accepted. */
  enabled: boolean;
  tier: Tier;
};

const TIERS: Tier[] = ["free", "cheap", "low", "mid", "premium"];

function load(): { all: Voice[]; defaultId: string } {
  const all = config.voices as Voice[];
  const ids = new Set<string>();
  for (const v of all) {
    if (typeof v.voice !== "string") throw new Error(`config/voices.json: "${v.id}" needs "voice" (it may be "").`);
    for (const k of ["id", "provider", "model", "name", "sample"] as const) {
      if (typeof v[k] !== "string" || !v[k]) throw new Error(`config/voices.json: "${v.id}" is missing "${k}".`);
    }
    if (typeof v.enabled !== "boolean") throw new Error(`config/voices.json: "${v.id}" needs "enabled": true or false.`);
    if (!TIERS.includes(v.tier)) throw new Error(`config/voices.json: "${v.id}" has tier "${v.tier}"; use free, cheap, low, mid or premium.`);
    if (!v.sample.startsWith("/")) throw new Error(`config/voices.json: sample for "${v.id}" must start with "/".`);
    if (ids.has(v.id)) throw new Error(`config/voices.json: id "${v.id}" appears twice.`);
    ids.add(v.id);
  }
  const def = all.find((v) => v.id === config.default);
  if (!def) throw new Error(`config/voices.json: default "${config.default}" is not in the list.`);
  if (!def.enabled) throw new Error(`config/voices.json: default "${config.default}" is not enabled.`);
  return { all, defaultId: def.id };
}

const { all, defaultId } = load();

export const DEFAULT_VOICE_ID = defaultId;

/** The voices on offer, in the order of the config file. */
export const ENABLED_VOICES: Voice[] = all.filter((v) => v.enabled);

/**
 * The voice for a stored or requested id. An unknown, removed or disabled id
 * gives the default, so a stale choice on a device can never select a voice
 * that is no longer offered. Server code must resolve ids through this and
 * never take a model or voice name from the browser.
 */
export function resolveVoice(id: string | null | undefined): Voice {
  return ENABLED_VOICES.find((v) => v.id === id) ?? ENABLED_VOICES.find((v) => v.id === defaultId)!;
}

/** Where the choice is kept on the device. */
export const VOICE_STORAGE_KEY = "nv_voice";

export const TIER_LABEL: Record<Tier, string> = {
  free: "Free",
  cheap: "Lowest cost",
  low: "Low cost",
  mid: "Mid cost",
  premium: "Premium",
};

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
