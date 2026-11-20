// Framework-free: no Next, React or browser APIs. "Mix voices": a set of voices
// that new recordings rotate through, and a playlist order that keeps the same
// voice from playing twice in a row.
import { ENABLED_VOICES, type Voice } from "@/lib/voices";

/**
 * Whether a voice slows down when asked. Measured in #19: Gemini voices took
 * `speed`; HeyGen voices (Nadine and the other nine) did not, so Sleep is no
 * slower in them apart from the pauses. Others are unmeasured: not in the default mix, labelled untested.
 */
export function honoursPace(v: Pick<Voice, "model">): boolean {
  return paceSupport(v) === "honours";
}

/** Measured behaviour for pace: honours (Gemini), ignores (HeyGen, #19), or untested (everything else). */
export function paceSupport(v: Pick<Voice, "model">): "honours" | "ignores" | "untested" {
  if (/^google\/gemini/.test(v.model)) return "honours";
  if (/^heygen\//.test(v.model)) return "ignores";
  return "untested";
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
 * can be avoided, keeping the first track. At each step the next track comes
 * from the voice (other than the last one played) with the most tracks left,
 * taking that voice's earliest remaining track. Choosing by most-left rather
 * than earliest-in-order is deliberate: the simpler greedy leaves one voice
 * bunched at the end (A,B,C,C would end C,C instead of becoming A,C,B,C).
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

/** Same-voice neighbours in `order`, counting the wrap from last to first (Repeat all). */
function repeatsInCycle(order: number[], voiceOf: (i: number) => string): number {
  let n = 0;
  for (let k = 0; k < order.length; k++) {
    if (voiceOf(order[k]) === voiceOf(order[(k + 1) % order.length])) n++;
  }
  return n;
}

/**
 * The play order with mixed voices. Without shuffle, play starts at the tapped
 * track `from` and runs round the whole playlist (from, ..., last, first, ...,
 * from - 1), so no part of the order is left unspread. The join from the last
 * track back to the first is checked too, for Repeat all. Returns the order and
 * the position to start at.
 */
export function mixedOrder(
  order: number[],
  from: number,
  shuffle: boolean,
  voiceOf: (i: number) => string,
): { order: number[]; start: number } {
  const ring = shuffle ? order : [...order.slice(from), ...order.slice(0, from)];
  const out = spreadVoices(ring, voiceOf);
  // Fix the wrap: swap the last track with one in the middle when that leaves fewer repeats.
  if (out.length >= 3 && voiceOf(out[out.length - 1]) === voiceOf(out[0])) {
    const base = repeatsInCycle(out, voiceOf);
    for (let k = out.length - 2; k >= 1; k--) {
      const t = out.slice();
      [t[k], t[t.length - 1]] = [t[t.length - 1], t[k]];
      if (repeatsInCycle(t, voiceOf) < base) {
        out.splice(0, out.length, ...t);
        break;
      }
    }
  }
  return { order: out, start: 0 };
}
