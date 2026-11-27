// Framework-free: no Next, React or browser APIs, so a native app can import it.
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
  /** A short plain description for pickers, e.g. "Warm female voice". Optional. */
  desc?: string;
  /** A pre-made clip under /public. Playing it costs nothing. */
  sample: string;
  /** Only enabled voices are offered or accepted. */
  enabled: boolean;
  /** May new audio be recorded in this voice? False means sample only. */
  generate: boolean;
  /**
   * Record the whole script in one request, with pauses written into the text
   * (#76). Only for models that honour inline pauses and a style instruction.
   */
  atomic?: boolean;
  tier: Tier;
  /** When true, this voice is only shown and accessible to adult-tier accounts. */
  adultOnly?: boolean;
};

const TIERS: Tier[] = ["free", "cheap", "low", "mid", "premium"];

function load(): { all: Voice[]; defaultId: string; adultDefaultId: string } {
  const all = config.voices as Voice[];
  const ids = new Set<string>();
  for (const v of all) {
    // These two may be empty, but must be present.
    for (const k of ["voice", "label"] as const) {
      if (typeof v[k] !== "string") throw new Error(`config/voices.json: "${v.id}" needs "${k}" (it may be "").`);
    }
    for (const k of ["id", "provider", "model", "name", "sample"] as const) {
      if (typeof v[k] !== "string" || !v[k]) throw new Error(`config/voices.json: "${v.id}" is missing "${k}".`);
    }
    for (const k of ["enabled", "generate"] as const) {
      if (typeof v[k] !== "boolean") throw new Error(`config/voices.json: "${v.id}" needs "${k}": true or false.`);
    }
    if (v.desc !== undefined && (typeof v.desc !== "string" || !v.desc)) {
      throw new Error(`config/voices.json: "${v.id}" has an empty or invalid "desc".`);
    }
    if (v.atomic !== undefined && typeof v.atomic !== "boolean") throw new Error(`config/voices.json: "${v.id}" has "atomic" that is not true or false.`);
    if (v.adultOnly !== undefined && typeof v.adultOnly !== "boolean") throw new Error(`config/voices.json: "${v.id}" has "adultOnly" that is not true or false.`);
    if (v.generate && !v.enabled) throw new Error(`config/voices.json: "${v.id}" has generate on but is not enabled.`);
    if (!TIERS.includes(v.tier)) throw new Error(`config/voices.json: "${v.id}" has tier "${v.tier}"; use free, cheap, low, mid or premium.`);
    if (!v.sample.startsWith("/")) throw new Error(`config/voices.json: sample for "${v.id}" must start with "/".`);
    if (ids.has(v.id)) throw new Error(`config/voices.json: id "${v.id}" appears twice.`);
    ids.add(v.id);
  }
  const def = all.find((v) => v.id === config.default);
  if (!def) throw new Error(`config/voices.json: default "${config.default}" is not in the list.`);
  if (!def.enabled) throw new Error(`config/voices.json: default "${config.default}" is not enabled.`);
  if (!def.generate) throw new Error(`config/voices.json: default "${config.default}" must have generate on.`);
  const adultDefaultKey = (config as { default: string; adultDefault?: string }).adultDefault;
  if (!adultDefaultKey) throw new Error(`config/voices.json: missing "adultDefault".`);
  const adultDef = all.find((v) => v.id === adultDefaultKey);
  if (!adultDef) throw new Error(`config/voices.json: adultDefault "${adultDefaultKey}" is not in the list.`);
  if (!adultDef.enabled) throw new Error(`config/voices.json: adultDefault "${adultDefaultKey}" is not enabled.`);
  if (!adultDef.generate) throw new Error(`config/voices.json: adultDefault "${adultDefaultKey}" must have generate on.`);
  return { all, defaultId: def.id, adultDefaultId: adultDef.id };
}

const { all, defaultId, adultDefaultId } = load();

export const DEFAULT_VOICE_ID = defaultId;
/** Default voice for adult-tier accounts. Change config/voices.json "adultDefault" to revert. */
export const ADULT_DEFAULT_VOICE_ID = adultDefaultId;

/** The voices on offer, in the order of the config file. */
export const ENABLED_VOICES: Voice[] = all.filter((v) => v.enabled);

/**
 * The voice for a stored or requested id. An id that is unknown, removed,
 * disabled or sample-only gives the default, so a stale choice on a device can
 * never select a voice that may not be recorded. Server code must resolve ids
 * through this and never take a model or voice name from the browser.
 */
export function resolveVoice(id: string | null | undefined): Voice {
  return (
    ENABLED_VOICES.find((v) => v.id === id && v.generate) ?? ENABLED_VOICES.find((v) => v.id === defaultId)!
  );
}

/**
 * Like resolveVoice, but respects adult-tier status.
 * - Non-adult users cannot reach adultOnly voices; they fall back to the standard default.
 * - Adult users fall back to ADULT_DEFAULT_VOICE_ID instead of DEFAULT_VOICE_ID.
 */
export function resolveVoiceForUser(id: string | null | undefined, isAdult: boolean): Voice {
  const v = ENABLED_VOICES.find((vv) => vv.id === id && vv.generate);
  if (v) {
    // Block adult-only voices for non-adult accounts.
    if (v.adultOnly && !isAdult) return ENABLED_VOICES.find((vv) => vv.id === defaultId)!;
    return v;
  }
  // Unknown / sample-only / missing: use tier-appropriate default.
  const fallbackId = isAdult ? adultDefaultId : defaultId;
  return ENABLED_VOICES.find((vv) => vv.id === fallbackId)!;
}

/** Voices visible in a picker for this user's tier. */
export function visibleVoices(isAdult: boolean): Voice[] {
  return isAdult ? ENABLED_VOICES : ENABLED_VOICES.filter((v) => !v.adultOnly);
}

export const TIER_LABEL: Record<Tier, string> = {
  free: "Free",
  cheap: "Lowest cost",
  low: "Low cost",
  mid: "Mid cost",
  premium: "Premium",
};

/** What a picker shows under a voice's name: its description, else its label. */
export function voiceBlurb(v: Voice): string {
  return v.desc ?? v.label;
}
