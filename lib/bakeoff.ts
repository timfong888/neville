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
  if (usdPerMChars < 5) return "Cheap";
  if (usdPerMChars < 12) return "Low";
  if (usdPerMChars < 25) return "Mid";
  return "Premium";
}
