// Phrase-level timing helper for the PhraseBox component.
// Framework-free: no React, no native APIs. Used by the Player and Library screens.
import { splitPhrase, PAUSE_DEFAULTS } from "@/lib/speech/pauses";

/**
 * Maximum words per phrase shown in the PhraseBox. Chosen so the longest phrase
 * fits on two lines at the largest Dynamic Type size without clipping.
 * Target range is 4–9 words; this is the hard upper bound.
 */
export const MAX_PHRASE_WORDS = 9;

/**
 * Minimum height (dp) for the PhraseBox container. Sized to hold two lines of
 * text at the xxxLarge Dynamic Type scale (~1.5× base, font 24 px, lineHeight 36 px)
 * plus 32 dp vertical padding: 2 × 36 + 32 = 104, rounded up to 112.
 */
export const PHRASE_BOX_MIN_HEIGHT = 112;

/** Split a script line into displayable phrases using the same break rules as delivery. */
export function splitPhrases(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [""];
  return splitPhrase(trimmed, MAX_PHRASE_WORDS);
}

/** Start positions (0–1 share of the line's total character count) for each phrase. */
export function phraseStarts(phrases: string[]): number[] {
  const total = phrases.reduce((n, p) => n + p.length, 0) || 1;
  let at = 0;
  return phrases.map((p) => {
    const start = at / total;
    at += p.length;
    return start;
  });
}

/**
 * Which phrase is active at `withinLine` (0–1 progress within the current line).
 * Uses the same character-count share approach as `lineStarts` in `lib/audio`.
 * Falls back to the whole line for a single-phrase line or empty input.
 */
export function activePhrase(line: string, withinLine: number): string {
  const phrases = splitPhrases(line);
  if (phrases.length === 1) return phrases[0];
  const starts = phraseStarts(phrases);
  let i = 0;
  while (i + 1 < starts.length && starts[i + 1] <= withinLine) i++;
  return phrases[i];
}

/**
 * Progress within the current line (0–1) given the whole-clip progress (0–1) and
 * the per-line start-share array from `lineStarts` in `lib/audio`.
 */
export function progressWithinLine(lineIdx: number, lineStarts: number[], progress: number): number {
  const lineStart = lineStarts[lineIdx] ?? 0;
  const lineEnd = lineStarts[lineIdx + 1] ?? 1;
  const span = lineEnd - lineStart;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (progress - lineStart) / span));
}

export { PAUSE_DEFAULTS };
