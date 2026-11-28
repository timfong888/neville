// Verbatim quotes from Neville Goddard, Feeling Is the Secret (1944).
// Source field is kept per quote so this list can be audited against the text.

export type Quote = {
  text: string;
  /** Book and year the quote is drawn from. */
  source: string;
  /** How long to show this quote (ms). Long quotes get extra reading time. */
  durationMs: number;
};

const SRC = "Feeling Is the Secret (1944)";

export const QUOTES: readonly Quote[] = [
  { text: "A change of feeling is a change of destiny.", source: SRC, durationMs: 4000 },
  { text: "You are already that which you want to be.", source: SRC, durationMs: 4000 },
  { text: "Whatever the mind of man can imagine, man can realize.", source: SRC, durationMs: 4000 },
  { text: "Always imagine and expect the best.", source: SRC, durationMs: 4000 },
  { text: "Signs follow, they do not precede.", source: SRC, durationMs: 4000 },
  { text: "All you can possibly need or desire is already yours.", source: SRC, durationMs: 4000 },
  { text: "Ideas enveloped in feeling are creative actions.", source: SRC, durationMs: 4000 },
  { text: "It is eternally true that the outside mirrors the inside.", source: SRC, durationMs: 4000 },
  { text: "The acceptance of the end automatically wills the means of realization.", source: SRC, durationMs: 4000 },
  {
    text: "Feeling the reality of the state sought and living and acting on that conviction is the way of all seeming miracles.",
    source: SRC,
    durationMs: 6000,
  },
  {
    text: "Imagine in picture form what you desire to achieve in life; then feel yourself as having already achieved it.",
    source: SRC,
    durationMs: 6000,
  },
  { text: "Assume the feeling that would be yours were you already in possession of your wish.", source: SRC, durationMs: 4000 },
  {
    text: "Whatever the mind of man can conceive and feel as true, the subconscious can and must objectify.",
    source: SRC,
    durationMs: 6000,
  },
  { text: "You are an eternal dreamer dreaming non-eternal dreams.", source: SRC, durationMs: 4000 },
];

/** Indices not yet shown in the current cycle. Empty means a fresh cycle starts next pick. */
export type QuoteState = { remaining: number[] };

export const emptyQuoteState = (): QuoteState => ({ remaining: [] });

/**
 * Pick the next quote without repeating until every quote has been shown once.
 * Pure: `rand` is a 0–<1 source (pass Math.random in production, a fixed value in tests).
 */
export function nextQuote(
  state: QuoteState,
  rand: () => number,
): { quote: Quote; nextState: QuoteState } {
  const pool = state.remaining.length > 0 ? state.remaining : QUOTES.map((_, i) => i);
  const slot = Math.floor(rand() * pool.length);
  const idx = pool[slot];
  const remaining = pool.filter((_, i) => i !== slot);
  return { quote: QUOTES[idx], nextState: { remaining } };
}

/**
 * After 45 s, return a patience message; otherwise null (normal quote cycling continues).
 */
export function waitLine(elapsedMs: number): string | null {
  return elapsedMs >= 45_000 ? "Still working. Almost there." : null;
}
