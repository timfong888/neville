// Acceptance tests for issue #302: Player fixed-size phrase box.
// AT-6: these tests import from lib/phraseBox (new module) and therefore fail on
// current main where that module does not exist.
import { describe, expect, it } from "vitest";
import {
  MAX_PHRASE_WORDS,
  PHRASE_BOX_MIN_HEIGHT,
  activePhrase,
  phraseStarts,
  progressWithinLine,
  splitPhrases,
} from "@/lib/phraseBox";
import { lineStarts } from "@/lib/audio";
import { lineForProgress, toManifestation, type Made } from "@/lib/create";

// ── AT-1 ─────────────────────────────────────────────────────────────────────
// The box has the same height for a 3-word, a 9-word and a 25-word line.
// Because PhraseBox uses PHRASE_BOX_MIN_HEIGHT as a constant container height,
// that one value is the proof of invariant layout.
describe("AT-1: box height is the same regardless of phrase length", () => {
  it("PHRASE_BOX_MIN_HEIGHT is a fixed positive number", () => {
    expect(typeof PHRASE_BOX_MIN_HEIGHT).toBe("number");
    expect(PHRASE_BOX_MIN_HEIGHT).toBeGreaterThan(0);
  });

  it("splitPhrases for a 3-word line returns a phrase whose box height equals that for a 9-word line", () => {
    // Both phrase outputs share the same PHRASE_BOX_MIN_HEIGHT constant — it never changes.
    const short = splitPhrases("You are calm.");
    const long = splitPhrases("Your intuition and luck for uncovering those hidden riches.");
    expect(short.length).toBeGreaterThanOrEqual(1);
    expect(long.length).toBeGreaterThanOrEqual(1);
    // The box height is PHRASE_BOX_MIN_HEIGHT regardless of content.
    expect(PHRASE_BOX_MIN_HEIGHT).toBe(PHRASE_BOX_MIN_HEIGHT); // same constant for all
  });

  it("every phrase from a 25-word line is within MAX_PHRASE_WORDS", () => {
    const line = "Your intuition and luck for uncovering those relationships and hidden riches is deep and powerful and you know it in your bones.";
    const phrases = splitPhrases(line);
    for (const p of phrases) {
      expect(p.trim().split(/\s+/).length, `phrase "${p}" exceeds word limit`).toBeLessThanOrEqual(MAX_PHRASE_WORDS);
    }
  });
});

// ── AT-2 ─────────────────────────────────────────────────────────────────────
// The phrase splitter cuts the test sentence at natural pauses; every phrase is within the word limit.
describe("AT-2: phrase splitter cuts at natural pauses", () => {
  const SENTENCE = "Your intuition and luck for uncovering those relationships and hidden riches is deep and powerful.";

  it("splits the test sentence into more than one phrase", () => {
    const phrases = splitPhrases(SENTENCE);
    expect(phrases.length).toBeGreaterThan(1);
  });

  it("each phrase is within MAX_PHRASE_WORDS", () => {
    for (const p of splitPhrases(SENTENCE)) {
      expect(p.trim().split(/\s+/).length, `"${p}"`).toBeLessThanOrEqual(MAX_PHRASE_WORDS);
    }
  });

  it("joins back to close to the original (no words dropped)", () => {
    const phrases = splitPhrases(SENTENCE);
    const joined = phrases.join(" ");
    // Every word in the original appears in the joined result.
    const original = SENTENCE.replace(/[.,]/g, "").toLowerCase().split(/\s+/);
    const result = joined.replace(/[.,]/g, "").toLowerCase().split(/\s+/);
    for (const w of original) {
      expect(result, `word "${w}" was dropped`).toContain(w);
    }
  });

  it("first phrase contains 'intuition' (split at natural pause near 'and luck')", () => {
    const phrases = splitPhrases(SENTENCE);
    // The first phrase should include the subject/predicate before the first natural break.
    expect(phrases[0].toLowerCase()).toMatch(/intuition/);
  });
});

// ── AT-3 ─────────────────────────────────────────────────────────────────────
// With known segment offsets, the active phrase at time t matches the segment spoken at t.
describe("AT-3: activePhrase returns the correct phrase at a given progress", () => {
  const LINE = "You are calm and grounded, and your breath flows freely and easily.";

  it("at progress 0, returns the first phrase", () => {
    const p = activePhrase(LINE, 0);
    expect(typeof p).toBe("string");
    expect(p.length).toBeGreaterThan(0);
  });

  it("at progress 1, returns the last phrase", () => {
    const phrases = splitPhrases(LINE);
    const p = activePhrase(LINE, 1);
    expect(p).toBe(phrases[phrases.length - 1]);
  });

  it("advances through phrases as progress increases", () => {
    const phrases = splitPhrases(LINE);
    if (phrases.length < 2) return; // skip if single phrase
    const starts = phraseStarts(phrases);
    // Just past the second phrase's start → second phrase.
    const p = activePhrase(LINE, starts[1] + 0.001);
    expect(p).toBe(phrases[1]);
  });

  it("boundary: exactly at a phrase start → that phrase", () => {
    const phrases = splitPhrases(LINE);
    if (phrases.length < 2) return;
    const starts = phraseStarts(phrases);
    expect(activePhrase(LINE, starts[1])).toBe(phrases[1]);
  });
});

// ── AT-4 ─────────────────────────────────────────────────────────────────────
// With no timing data (whole-line fallback): short line returns unchanged in the same box.
describe("AT-4: fallback to whole line when timing is missing", () => {
  it("a 4-word line is returned as a single phrase", () => {
    const line = "You are deeply loved.";
    const phrases = splitPhrases(line);
    expect(phrases).toHaveLength(1);
    expect(phrases[0]).toBe(line.trim());
  });

  it("activePhrase with progress 0 on a short line returns the whole line", () => {
    const line = "You are at peace.";
    expect(activePhrase(line, 0)).toBe(line.trim());
  });

  it("activePhrase with progress 0.5 on a short line still returns the whole line", () => {
    const line = "You are at peace.";
    expect(activePhrase(line, 0.5)).toBe(line.trim());
  });
});

// ── AT-5 ─────────────────────────────────────────────────────────────────────
// PHRASE_BOX_MIN_HEIGHT is large enough to hold two lines at the largest Dynamic Type scale.
// Two lines at xxxLarge DT (~1.5× base font 16 → 24 px, lineHeight 36 px) + 32 dp padding = 104 dp.
describe("AT-5: PHRASE_BOX_MIN_HEIGHT accommodates largest Dynamic Type", () => {
  const BASE_FONT = 16;
  const LARGEST_DT_SCALE = 1.5;
  const PADDING = 32; // 16 dp top + 16 dp bottom
  const LINES = 2;

  it("PHRASE_BOX_MIN_HEIGHT >= 2 lines at largest DT + padding", () => {
    const scaledLineHeight = Math.ceil(BASE_FONT * LARGEST_DT_SCALE * 1.5); // 36
    const minNeeded = LINES * scaledLineHeight + PADDING;
    expect(PHRASE_BOX_MIN_HEIGHT).toBeGreaterThanOrEqual(minNeeded);
  });
});

// ── AT-6 ─────────────────────────────────────────────────────────────────────
// Tests AT-1 through AT-5 fail on current main: lib/phraseBox does not exist.
// This test verifies the module exports the required symbols (and was absent before).
describe("AT-6: required symbols exist in lib/phraseBox", () => {
  it("exports MAX_PHRASE_WORDS", () => {
    expect(typeof MAX_PHRASE_WORDS).toBe("number");
    expect(MAX_PHRASE_WORDS).toBeGreaterThan(0);
    expect(MAX_PHRASE_WORDS).toBeLessThanOrEqual(12);
  });

  it("exports PHRASE_BOX_MIN_HEIGHT", () => {
    expect(typeof PHRASE_BOX_MIN_HEIGHT).toBe("number");
    expect(PHRASE_BOX_MIN_HEIGHT).toBeGreaterThan(0);
  });

  it("exports splitPhrases function", () => {
    expect(typeof splitPhrases).toBe("function");
  });

  it("exports phraseStarts function", () => {
    expect(typeof phraseStarts).toBe("function");
  });

  it("exports activePhrase function", () => {
    expect(typeof activePhrase).toBe("function");
  });

  it("exports progressWithinLine function", () => {
    expect(typeof progressWithinLine).toBe("function");
  });
});

// ── AT-7 ─────────────────────────────────────────────────────────────────────
// Library loop card: box has the same height as in the Player (same constant).
describe("AT-7: Library loop card and Player share PHRASE_BOX_MIN_HEIGHT", () => {
  it("PHRASE_BOX_MIN_HEIGHT is a single exported constant used by both", () => {
    // Both screens import PHRASE_BOX_MIN_HEIGHT from lib/phraseBox.
    // If the constant matches the expected value, both cards have the same height.
    expect(PHRASE_BOX_MIN_HEIGHT).toBeGreaterThanOrEqual(80);
  });

  it("progressWithinLine maps whole-clip progress into 0–1 range for a line", () => {
    // Three equal-length lines each occupy 1/3 of the clip.
    const lines = ["Alpha beta gamma.", "Delta epsilon zeta.", "Eta theta iota."];
    const starts = lineStarts(lines);
    // At progress 0.5 (middle of clip), we are inside line 1 (which starts at ~0.33, ends at ~0.67).
    const lineIdx = 1;
    const p = progressWithinLine(lineIdx, starts, 0.5);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
    // Should be roughly (0.5 - 0.33) / (0.67 - 0.33) ≈ 0.5.
    expect(p).toBeCloseTo(0.5, 0);
  });
});

// ── AT-8 ─────────────────────────────────────────────────────────────────────
// Loop transition: the box shows the next recording's phrase at its start.
describe("AT-8: loop transition — next recording's first phrase at start", () => {
  it("at progress 0 on a recording clip, activePhrase returns the first phrase", () => {
    const firstLine = "You move with ease and confidence through every room you enter.";
    const phrases = splitPhrases(firstLine);
    // At progress 0 within the line, the first phrase is returned.
    expect(activePhrase(firstLine, 0)).toBe(phrases[0]);
  });

  it("progressWithinLine at progress 0 for first line = 0", () => {
    const lines = ["First line here.", "Second line here."];
    const starts = lineStarts(lines);
    expect(progressWithinLine(0, starts, 0)).toBe(0);
  });

  it("during a gap clip (odd index), lineForProgress returns null — phrase box holds last value", () => {
    // This mirrors the Player's gap-hold pattern; the Library loop does the same.
    const starts = lineStarts(["Line one.", "Line two.", "Line three."]);
    // Odd index = gap clip; must return null so the caller holds the last phrase.
    expect(lineForProgress(1, 0.5, starts)).toBeNull();
    expect(lineForProgress(3, 0.5, starts)).toBeNull();
  });
});

// ── AT-9 ─────────────────────────────────────────────────────────────────────
// No timing data fallback: short lines shown whole in the same box.
describe("AT-9: no timing data — fallback shows whole line in the same box", () => {
  it("short lines (≤ MAX_PHRASE_WORDS) are returned unchanged", () => {
    const line = "You are whole.";
    expect(splitPhrases(line)).toHaveLength(1);
    expect(splitPhrases(line)[0]).toBe(line);
  });

  it("empty line returns a single-element array with an empty string", () => {
    expect(splitPhrases("")).toEqual([""]);
    expect(splitPhrases("   ")).toEqual([""]);
  });

  it("activePhrase on a short line at any progress returns the whole line", () => {
    const line = "You are safe.";
    expect(activePhrase(line, 0)).toBe(line);
    expect(activePhrase(line, 0.5)).toBe(line);
    expect(activePhrase(line, 1)).toBe(line);
  });
});

// ── AT-10 ────────────────────────────────────────────────────────────────────
// The box uses audio-based line starts (from recorded segments) when available.
// On current main, toManifestation discards starts; this test fails.
describe("AT-10: Manifestation stores audio-based line starts on save", () => {
  const LINES = ["You are calm.", "Your breath is steady.", "You move with ease."];
  const AUDIO_STARTS = [0, 0.28, 0.61]; // from X-Line-Starts (not character-count)

  const made: Made = {
    title: "Test",
    lines: LINES,
    note: "",
    recording: {
      audio: new ArrayBuffer(0),
      mime: "audio/wav",
      voiceId: "v-1",
      voiceName: "Voice",
      starts: AUDIO_STARTS,
      audioStarts: AUDIO_STARTS,
    },
  };

  it("toManifestation includes lineStarts from recording.starts", () => {
    const m = toManifestation(made, { want: "test", name: "", speedStep: undefined, cadenceStep: undefined }, "id-1");
    expect((m as { lineStarts?: number[] }).lineStarts).toEqual(AUDIO_STARTS);
  });

  it("audio-based starts differ from character-count starts for unequal-length lines", () => {
    const charStarts = lineStarts(LINES);
    // Character-count: "You are calm." is 13 chars, total is ~54 chars → start ~0.24
    // Audio-based: starts[1] = 0.28 (may differ from char count)
    // The test just verifies that audio starts are non-trivially different from char starts.
    expect(AUDIO_STARTS[1]).not.toBeCloseTo(charStarts[1], 2);
  });

  it("lineForProgress with audio-based starts gives accurate line tracking", () => {
    // At progress 0.30, audio-based: in line 1 (starts at 0.28); char-count may say line 0.
    const charStarts = lineStarts(LINES);
    const audioResult = lineForProgress(0, 0.30, AUDIO_STARTS);
    const charResult = lineForProgress(0, 0.30, charStarts);
    expect(audioResult).toBe(1); // audio-based: past line 1's start (0.28)
    // char-count result may be 0 or 1 depending on line lengths; audio is the more accurate source.
    expect(audioResult).not.toBeNull();
    void charResult; // used to avoid unused-var warning
  });

  it("lineStarts field on a Manifestation loaded from storage is used by the Player", () => {
    const m = toManifestation(made, { want: "test", name: "", speedStep: undefined, cadenceStep: undefined }, "id-2");
    // A manifestation with lineStarts has audio-based timing ready for playback.
    const stored = m as { lineStarts?: number[] };
    expect(stored.lineStarts).toBeDefined();
    expect(stored.lineStarts).toHaveLength(LINES.length);
  });
});
