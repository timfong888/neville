// Neville-voice phrases shown while a recording is being made.
export const PHRASES: readonly string[] = [
  "Shaping your words.",
  "Listening to your wish.",
  "Finding your voice.",
  "Almost there, breathe.",
  "You are already on your way.",
  "Making it real.",
  "Settling into your truth.",
  "Let it unfold.",
  "Your words are becoming.",
  "Breathing life into your wish.",
  "Drawing it toward you.",
  "It is already done.",
  "Feel it as yours.",
  "Opening the way.",
  "The path is clear.",
  "Moving closer to you.",
  "Trust the process.",
  "Something good is forming.",
  "Your wish is heard.",
  "One moment more.",
];

/** Indices not yet shown in the current cycle. Empty means a fresh cycle starts next pick. */
export type PhraseState = { remaining: number[] };

export const emptyPhraseState = (): PhraseState => ({ remaining: [] });

/**
 * Pick the next phrase without repeating until every phrase has been shown once.
 * Pure: `rand` is a 0–<1 source (pass Math.random in production, a fixed value in tests).
 */
export function nextPhrase(
  state: PhraseState,
  rand: () => number,
): { phrase: string; nextState: PhraseState } {
  const pool = state.remaining.length > 0 ? state.remaining : PHRASES.map((_, i) => i);
  const slot = Math.floor(rand() * pool.length);
  const idx = pool[slot];
  const remaining = pool.filter((_, i) => i !== slot);
  return { phrase: PHRASES[idx], nextState: { remaining } };
}

/**
 * After 45 seconds, return a patience message so the user knows the app is still working.
 * Returns null while the normal phrase cycle should continue.
 */
export function waitLine(elapsedMs: number): string | null {
  return elapsedMs >= 45_000 ? "Still working. Almost there." : null;
}
