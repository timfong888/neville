import { describe, expect, it } from "vitest";
import { emptyQuoteState, nextQuote, QUOTES, waitLine } from "@/lib/waitingQuotes";

describe("QUOTES data", () => {
  it("every quote has a non-empty source", () => {
    for (const q of QUOTES) {
      expect(q.source.trim().length).toBeGreaterThan(0);
    }
  });

  it("contains no thanks or gratitude language", () => {
    const forbidden = /thank|grateful|gratitude/i;
    for (const q of QUOTES) {
      expect(q.text).not.toMatch(forbidden);
    }
  });

  it("every quote has a positive durationMs", () => {
    for (const q of QUOTES) {
      expect(q.durationMs).toBeGreaterThan(0);
    }
  });
});

describe("nextQuote", () => {
  it("returns a quote from the list", () => {
    const { quote } = nextQuote(emptyQuoteState(), Math.random);
    expect(QUOTES).toContainEqual(quote);
  });

  it("cycles through all quotes before any repeats", () => {
    let state = emptyQuoteState();
    const seen: string[] = [];
    for (let i = 0; i < QUOTES.length; i++) {
      const { quote, nextState } = nextQuote(state, Math.random);
      seen.push(quote.text);
      state = nextState;
    }
    expect(new Set(seen).size).toBe(QUOTES.length);
    expect(seen).toHaveLength(QUOTES.length);
  });

  it("starts a new cycle after all quotes are exhausted", () => {
    let state = emptyQuoteState();
    for (let i = 0; i < QUOTES.length; i++) {
      const { nextState } = nextQuote(state, Math.random);
      state = nextState;
    }
    const { quote } = nextQuote(state, Math.random);
    expect(QUOTES).toContainEqual(quote);
  });

  it("covers all quotes across multiple cycles with no within-cycle repeats", () => {
    let state = emptyQuoteState();
    for (let cycle = 0; cycle < 3; cycle++) {
      const cycleResult: string[] = [];
      for (let i = 0; i < QUOTES.length; i++) {
        const { quote, nextState } = nextQuote(state, Math.random);
        cycleResult.push(quote.text);
        state = nextState;
      }
      expect(new Set(cycleResult).size).toBe(QUOTES.length);
    }
  });

  it("is deterministic given a fixed rand", () => {
    const { quote: a } = nextQuote(emptyQuoteState(), () => 0);
    const { quote: b } = nextQuote(emptyQuoteState(), () => 0);
    expect(a.text).toBe(b.text);
  });

  it("picks different quotes with different rand values", () => {
    const { quote: first } = nextQuote(emptyQuoteState(), () => 0);
    const { quote: last } = nextQuote(emptyQuoteState(), () => 0.999);
    expect(first.text).not.toBe(last.text);
  });
});

describe("waitLine", () => {
  it("returns null before 45 seconds", () => {
    expect(waitLine(0)).toBeNull();
    expect(waitLine(1_000)).toBeNull();
    expect(waitLine(44_999)).toBeNull();
  });

  it("returns the patience message at exactly 45 seconds", () => {
    expect(waitLine(45_000)).toBe("Still working. Almost there.");
  });

  it("returns the patience message after 45 seconds", () => {
    expect(waitLine(60_000)).toBe("Still working. Almost there.");
    expect(waitLine(120_000)).toBe("Still working. Almost there.");
  });
});
