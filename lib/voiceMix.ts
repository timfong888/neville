// Framework-free: no Next, React or browser APIs. "Mix voices": a set of voices
// that new recordings rotate through, and a playlist order that keeps the same
// voice from playing twice in a row.
import { ENABLED_VOICES, type Voice } from "@/lib/voices";

/**
 * Whether a voice slows down when asked. Measured in #19: Gemini voices took
 * `speed`; HeyGen voices (Nadine and the other nine) did not, so Sleep is no
 * slower in them apart from the pauses. Others are unmeasured and counted as not.
 */
export function honoursPace(v: Pick<Voice, "model">): boolean {
  return /^google\/gemini/.test(v.model);
}

/** Voices that may be recorded and so may be in a mix. */
export const MIXABLE_VOICES: Voice[] = ENABLED_VOICES.filter((v) => v.generate);

/** The default mix: every recordable voice that honours pace (the Gemini voices). */
export const DEFAULT_MIX: string[] = MIXABLE_VOICES.filter(honoursPace).map((v) => v.id);

/** Keeps only recordable ids, in config order, without repeats. Empty or invalid gives the default. */
export function cleanMix(ids: unknown): string[] {
  const want = new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []);
  const out = MIXABLE_VOICES.filter((v) => want.has(v.id)).map((v) => v.id);
  return out.length ? out : DEFAULT_MIX;
}

/** The voice for the `n`th recording made with the mix on. */
export function mixVoiceAt(mix: string[], n: number): string {
  const m = cleanMix(mix);
  return m[((Math.floor(n) % m.length) + m.length) % m.length];
}

/**
 * Reorders `order` (track indexes) so no voice plays twice in a row where that
 * can be avoided, keeping the first track and otherwise the original order as
 * far as it can: at each step the earliest remaining track in a different voice
 * goes next.
 */
export function spreadVoices(order: number[], voiceOf: (i: number) => string): number[] {
  if (order.length < 3) return order;
  const left = order.slice(1);
  const out = [order[0]];
  while (left.length) {
    const last = voiceOf(out[out.length - 1]);
    // Prefer a different voice; among those, the voice with the most tracks left, so it is not stranded at the end.
    const counts = new Map<string, number>();
    left.forEach((i) => counts.set(voiceOf(i), (counts.get(voiceOf(i)) ?? 0) + 1));
    let pick = -1;
    let best = -1;
    left.forEach((i, k) => {
      const v = voiceOf(i);
      if (v === last) return;
      const c = counts.get(v)!;
      if (c > best) {
        best = c;
        pick = k;
      }
    });
    if (pick < 0) pick = 0;
    out.push(left.splice(pick, 1)[0]);
  }
  return out;
}
