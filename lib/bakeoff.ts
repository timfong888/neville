// The voices in the bake-off, cheapest first once prices load. All are
// reachable with the one OpenRouter key. `voice` is the default pick; an empty
// voice means the model's own default (Fish Audio lists no voices).

import data from "./bakeoff.json";

export type Expressive = {
  /** How delivery is steered, in a few words. */
  method: string;
  /** The documented syntax, as an example. */
  syntax: string;
  /** A short quote from the vendor's documentation, and where it is. */
  quote: string;
  url: string;
  /** The sample script with cues added. Null when the cue is a separate instruction. */
  text: string | null;
  /** A style instruction sent alongside the unchanged script (Gemini 3.8). */
  instructions?: string;
};

export type BakeoffEntry = {
  model: string;
  voice: string;
  note?: string;
  expressive: Expressive | null;
  /** Why there is no expressive sample. */
  why?: string;
};

export const BAKEOFF = data as BakeoffEntry[];

/** A one-minute affirmation is about 900 characters of script. */
export const ONE_MINUTE_CHARS = 900;

/** Gemini bills speech as output tokens: 32 a second. */
export const AUDIO_TOKENS_PER_MINUTE = 32 * 60;

export const SAMPLE_WANT = "I want to be calm and confident when I speak";

/** List prices for services that are not on OpenRouter and would need their own key. */
export const OFF_ROUTER: Array<{ name: string; usdPerMChars: string; note: string }> = [
  { name: "OpenAI gpt-4o-mini-tts", usdPerMChars: "about $15 to $20", note: "Priced per audio token; per-character figure is an estimate." },
  { name: "Google Chirp 3 HD", usdPerMChars: "$30", note: "" },
  { name: "Amazon Polly generative", usdPerMChars: "$30", note: "" },
  { name: "Cartesia Sonic", usdPerMChars: "$37 to $50", note: "Depends on plan." },
];

export function tierFor(usdPerMChars: number | null): string {
  if (usdPerMChars === null) return "Price unknown";
  if (usdPerMChars === 0) return "Free";
  if (usdPerMChars < 5) return "Cheap";
  if (usdPerMChars < 12) return "Low";
  if (usdPerMChars < 25) return "Mid";
  return "Premium";
}

/**
 * The rest of OpenRouter's speech list: what each says about steering delivery
 * from the prompt, and any per-request text limit. "Not stated" means neither
 * the catalog description nor the vendor documentation we read says so.
 */
export const OTHER_MODELS: Record<string, { expressive: string; limit?: string }> = {
  "heygen/heygen-voice-1-turbo:free": { expressive: "Same tags as HeyGen Voice Turbo" },
  "heygen/heygen-voice-1": { expressive: "Same tags as HeyGen Voice Turbo" },
  "fish-audio/s1": { expressive: "Fixed tags in (parentheses). Retires 31 Dec 2026" },
  "fish-audio/s2-pro": { expressive: "Free-form cues in square brackets" },
  "speechify/simba-3.5": { expressive: "Not stated" },
  "assemblyai/assemblyai-tts-1": { expressive: "Not stated" },
  "microsoft/mai-voice-2.1-flash": { expressive: "Not stated" },
  "microsoft/mai-voice-2-flash": { expressive: "Not stated" },
  "microsoft/mai-voice-2.1": { expressive: "Not stated" },
  "microsoft/mai-voice-2": { expressive: "Not stated" },
  "qwen/qwen-audio-3.0-tts-flash": { expressive: "Inline tags such as [very slowly] and [whispers]" },
  "qwen/qwen-audio-3.0-tts-plus": { expressive: "Not stated" },
  "mistralai/voxtral-mini-tts-2603": { expressive: "None. Delivery follows the chosen voice" },
  "deepgram/aura-2": { expressive: "None. Punctuation only" },
  "deepgram/flux-tts": { expressive: "Not stated" },
  "elevenlabs/eleven-v3-conversational": { expressive: "Not stated", limit: "5,000" },
  "elevenlabs/eleven-flash-v2.5": { expressive: "Not stated", limit: "40,000" },
  "elevenlabs/eleven-turbo-v2": { expressive: "Not stated", limit: "30,000" },
  "elevenlabs/eleven-turbo-v2.5": { expressive: "Not stated", limit: "40,000" },
  "elevenlabs/eleven-flash-v2": { expressive: "Not stated", limit: "30,000" },
  "elevenlabs/eleven-v4": { expressive: "Free-form audio tags in square brackets", limit: "10,000" },
  "elevenlabs/eleven-v3": { expressive: "Audio tags in square brackets", limit: "5,000" },
  "elevenlabs/eleven-multilingual-v2": { expressive: "Not stated", limit: "10,000" },
  "minimax/speech-2.8-turbo": { expressive: "Sounds and pauses only, such as (sighs)" },
  "minimax/speech-2.8-hd": { expressive: "Sounds and pauses only, such as (sighs)" },
  "bytedance-seed/seed-audio-1-0": { expressive: "A plain-language prompt describes the voice and tone. Not priced per character" },
};

/** Per-request text limits for the voices in the bake-off, where one is known. */
export const BAKEOFF_LIMITS: Record<string, string> = {
  "canopylabs/orpheus-3b-0.1-ft": "300",
  "sesame/csm-1b": "200",
};
