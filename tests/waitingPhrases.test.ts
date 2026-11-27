import { describe, expect, it } from "vitest";
import { emptyPhraseState, nextPhrase, PHRASES, waitLine } from "@/lib/waitingPhrases";

describe("nextPhrase", () => {
  it("returns a phrase from the list", () => {
    const { phrase } = nextPhrase(emptyPhraseState(), Math.random);
    expect(PHRASES).toContain(phrase);
  });

  it("cycles through all phrases before any repeats", () => {
    let state = emptyPhraseState();
    const seen: string[] = [];
    for (let i = 0; i < PHRASES.length; i++) {
      const { phrase, nextState } = nextPhrase(state, Math.random);
      seen.push(phrase);
      state = nextState;
    }
    expect(new Set(seen).size).toBe(PHRASES.length);
    expect(seen).toHaveLength(PHRASES.length);
  });

  it("starts a new cycle after all phrases are exhausted", () => {
    let state = emptyPhraseState();
    for (let i = 0; i < PHRASES.length; i++) {
      const { nextState } = nextPhrase(state, Math.random);
      state = nextState;
    }
    // remaining is empty after full cycle; next call should start fresh
    const { phrase } = nextPhrase(state, Math.random);
    expect(PHRASES).toContain(phrase);
  });

  it("covers all phrases across multiple cycles with no within-cycle repeats", () => {
    let state = emptyPhraseState();
    for (let cycle = 0; cycle < 3; cycle++) {
      const cycleResult: string[] = [];
      for (let i = 0; i < PHRASES.length; i++) {
        const { phrase, nextState } = nextPhrase(state, Math.random);
        cycleResult.push(phrase);
        state = nextState;
      }
      expect(new Set(cycleResult).size).toBe(PHRASES.length);
    }
  });

  it("is deterministic given a fixed rand", () => {
    const { phrase: a } = nextPhrase(emptyPhraseState(), () => 0);
    const { phrase: b } = nextPhrase(emptyPhraseState(), () => 0);
    expect(a).toBe(b);
  });

  it("picks different items with different rand values", () => {
    const { phrase: first } = nextPhrase(emptyPhraseState(), () => 0);
    const { phrase: last } = nextPhrase(emptyPhraseState(), () => 0.999);
    // With 20 phrases the first and last slot are different
    expect(first).not.toBe(last);
  });
});

describe("waitLine", () => {
  it("returns null before 45 seconds", () => {
    expect(waitLine(0)).toBeNull();
    expect(waitLine(1_000)).toBeNull();
    expect(waitLine(44_999)).toBeNull();
  });

  it("returns the patience message at exactly 45 seconds", () => {
    expect(waitLine(45_000)).toBe("Still working. Thanks for waiting.");
  });

  it("returns the patience message after 45 seconds", () => {
    expect(waitLine(60_000)).toBe("Still working. Thanks for waiting.");
    expect(waitLine(120_000)).toBe("Still working. Thanks for waiting.");
  });
});
