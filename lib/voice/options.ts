// Curated voice list and speed/cadence user choices. Framework-free.
// Speed and cadence replace the pace/tone matrix for the create UI: three simple
// steps each, mapped to the values the provider actually uses.
import { ENABLED_VOICES, type Voice } from "@/lib/voices";

/** The 5 curated voice ids offered in the create flow's inline voice picker. */
export const CURATED_VOICE_IDS: readonly string[] = [
  "gemini-sulafat",        // Warm female
  "gemini-vindemiatrix",   // Gentle female
  "gemini-algieba",        // Smooth male
  "gemini-charon",         // Low, steady male
  "heygen-nadine",         // Calm female, lower pitch
];

/** Curated Voice objects for the web create flow (native uses the server-fetched list). */
export const CURATED_VOICES: Voice[] = ENABLED_VOICES.filter(
  (v) => (CURATED_VOICE_IDS as readonly string[]).includes(v.id) && v.generate,
);

export type SpeedStep = "slower" | "normal" | "faster";
export type CadenceStep = "short" | "natural" | "long";

export type SpeedOption = { id: SpeedStep; label: string; speed: number };
export type CadenceOption = { id: CadenceStep; label: string; pauseMs: number };

export const SPEED_OPTIONS: readonly SpeedOption[] = [
  { id: "slower", label: "Slower", speed: 0.78 },
  { id: "normal", label: "Normal", speed: 0.9 },
  { id: "faster", label: "Faster", speed: 1.05 },
];

/** Pause values from issue 226: phrase (~900 ms), sentence (~1 500 ms), refrain (~2 600 ms). */
export const CADENCE_OPTIONS: readonly CadenceOption[] = [
  { id: "short",   label: "Short pauses", pauseMs: 900 },
  { id: "natural", label: "Natural",      pauseMs: 1500 },
  { id: "long",    label: "Long pauses",  pauseMs: 2600 },
];

/** Default to Slower per the issue: "this is for relaxing". */
export const DEFAULT_SPEED_STEP: SpeedStep = "slower";
export const DEFAULT_CADENCE_STEP: CadenceStep = "natural";

export function resolveSpeed(id: unknown): SpeedOption {
  return SPEED_OPTIONS.find((s) => s.id === id) ?? SPEED_OPTIONS.find((s) => s.id === DEFAULT_SPEED_STEP)!;
}

export function resolveCadence(id: unknown): CadenceOption {
  return CADENCE_OPTIONS.find((c) => c.id === id) ?? CADENCE_OPTIONS.find((c) => c.id === DEFAULT_CADENCE_STEP)!;
}

/** One-line summary label: "Sulafat · Slower · Natural". */
export function voiceOptionLabel(voiceName: string, speed: SpeedStep, cadence: CadenceStep): string {
  return `${voiceName} · ${resolveSpeed(speed).label} · ${resolveCadence(cadence).label}`;
}
