// The voices in the bake-off, cheapest first once prices load. All are
// reachable with the one OpenRouter key. `voice` is the default pick; an empty
// voice means the model's own default (Fish Audio lists no voices).

export type BakeoffEntry = { model: string; voice: string; note?: string };

export const BAKEOFF: BakeoffEntry[] = [
  { model: "hexgrad/kokoro-82m", voice: "af_heart", note: "Open model. Cheapest paid option." },
  { model: "heygen/heygen-voice-1-turbo", voice: "nadine" },
  { model: "canopylabs/orpheus-3b-0.1-ft", voice: "tara", note: "Open model." },
  { model: "sesame/csm-1b", voice: "read_speech_a", note: "Open model." },
  { model: "fish-audio/drama-3", voice: "", note: "Fish Audio's cheaper model. Default voice." },
  { model: "mistralai/voxtral-mini-tts-3-0", voice: "voice_3150" },
  { model: "fish-audio/s1", voice: "", note: "Fish Audio S1. Default voice." },
  { model: "x-ai/grok-voice-tts-1.0", voice: "eve" },
  { model: "google/gemini-3.8-flash-lite-tts", voice: "Kore", note: "Priced per token, not per character." },
  { model: "elevenlabs/eleven-v4-turbo", voice: "george", note: "Kept as the expensive reference." },
];

/** A one-minute affirmation is about 900 characters of script. */
export const ONE_MINUTE_CHARS = 900;

export const SAMPLE_WANT = "I want to be calm and confident when I speak";

/** List prices for services that are not on OpenRouter and would need their own key. */
export const OFF_ROUTER: Array<{ name: string; usdPerMChars: string; note: string }> = [
  { name: "OpenAI gpt-4o-mini-tts", usdPerMChars: "about $15 to $20", note: "Priced per audio token; per-character figure is an estimate." },
  { name: "Google Chirp 3 HD", usdPerMChars: "$30", note: "" },
  { name: "Amazon Polly generative", usdPerMChars: "$30", note: "" },
  { name: "Cartesia Sonic", usdPerMChars: "$37 to $50", note: "Depends on plan." },
];

export function tierFor(usdPerMChars: number | null): string {
  if (usdPerMChars === null) return "Per token";
  if (usdPerMChars < 5) return "Cheap";
  if (usdPerMChars < 12) return "Low";
  if (usdPerMChars < 25) return "Mid";
  return "Premium";
}
