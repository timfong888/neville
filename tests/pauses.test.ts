import { describe, expect, it } from "vitest";
import {
  PAUSE_DEFAULTS,
  type Segment,
  segmentLines,
  segmentsToPausedLines,
  splitPhrase,
} from "@/lib/speech/pauses";

const MAX = PAUSE_DEFAULTS.maxWords; // 12

describe("splitPhrase", () => {
  it("leaves short sentences unchanged", () => {
    expect(splitPhrase("You hold the keys.", MAX)).toEqual(["You hold the keys."]);
    expect(splitPhrase("You are calm.")).toEqual(["You are calm."]);
    expect(splitPhrase("It is done.")).toHaveLength(1);
  });

  it("produces no phrase over 12 words", () => {
    const long =
      "You feel the warmth of the sunlight on your face and the gentle sound of waves and the smell of salt in the air.";
    for (const p of splitPhrase(long, MAX)) {
      expect(p.split(/\s+/).length, p).toBeLessThanOrEqual(MAX);
    }
  });

  it("splits at the last comma before maxWords", () => {
    const s = "You feel the heavy blanket on your legs, and the warm mug in your hands.";
    const parts = splitPhrase(s, MAX);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0]).toContain("legs");
    for (const p of parts) {
      expect(p.split(/\s+/).length, p).toBeLessThanOrEqual(MAX);
    }
  });

  it("splits at 'and' when there is no comma", () => {
    const s = "You hold the keys in your hand and the sea is bright before you.";
    const parts = splitPhrase(s, MAX);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(p.split(/\s+/).length, p).toBeLessThanOrEqual(MAX);
    }
  });

  it("splits at 'while' and 'then'", () => {
    const w = "You breathe slowly while the tide comes in and the sky turns pale.";
    const partsW = splitPhrase(w, MAX);
    expect(partsW.length).toBeGreaterThan(1);

    const t = "You set the cup down then the warmth spreads across your chest and you are still.";
    const partsT = splitPhrase(t, MAX);
    expect(partsT.length).toBeGreaterThan(1);
  });

  it("does not modify a sentence that is exactly maxWords", () => {
    const words = Array.from({ length: MAX }, (_, i) => `word${i}`).join(" ") + ".";
    expect(splitPhrase(words, MAX)).toHaveLength(1);
  });
});

describe("segmentLines", () => {
  it("produces one sentence segment per short line", () => {
    const lines = ["You are calm.", "You hold the key."];
    const segs = segmentLines(lines);
    expect(segs).toEqual([
      { text: "You are calm.", pauseAfter: "sentence" },
      { text: "You hold the key.", pauseAfter: "sentence" },
    ]);
  });

  it("marks phrase then sentence for a split line", () => {
    const long = "You feel the heavy blanket on your legs, and the warm mug in your hands.";
    const segs = segmentLines([long], 0, MAX);
    expect(segs.length).toBeGreaterThan(1);
    for (let i = 0; i < segs.length - 1; i++) {
      expect(segs[i].pauseAfter, `segment ${i}`).toBe("phrase");
    }
    expect(segs[segs.length - 1].pauseAfter).toBe("sentence");
  });

  it("marks trailing refrain lines", () => {
    const lines = ["You are calm.", "It is done.", "Thank you."];
    const segs = segmentLines(lines, 1);
    expect(segs[0].pauseAfter).toBe("sentence");
    expect(segs[1].pauseAfter).toBe("sentence");
    expect(segs[2].pauseAfter).toBe("refrain");
  });

  it("short sentences pass through end-to-end without change", () => {
    const lines = ["You are calm.", "It is done."];
    const { lines: out } = segmentsToPausedLines(segmentLines(lines));
    expect(out).toEqual(lines);
  });
});

describe("segmentsToPausedLines", () => {
  it("assigns phraseMs / sentenceMs / refrainMs correctly", () => {
    const cfg = { phraseMs: 500, sentenceMs: 1200, refrainMs: 1800, maxWords: 12 };
    const segs: Segment[] = [
      { text: "A", pauseAfter: "phrase" },
      { text: "B", pauseAfter: "sentence" },
      { text: "C", pauseAfter: "refrain" },
    ];
    const { lines, pauseMsPerGap } = segmentsToPausedLines(segs, cfg);
    expect(lines).toEqual(["A", "B", "C"]);
    // pauseMsPerGap has lines.length - 1 entries
    expect(pauseMsPerGap).toHaveLength(2);
    expect(pauseMsPerGap[0]).toBe(500);
    expect(pauseMsPerGap[1]).toBe(1200);
  });

  it("produces one sentenceMs gap for two short lines", () => {
    const lines = ["You are calm.", "It is done."];
    const { pauseMsPerGap } = segmentsToPausedLines(segmentLines(lines));
    expect(pauseMsPerGap).toEqual([PAUSE_DEFAULTS.sentenceMs]);
  });

  it("produces a phraseMs gap inside a split sentence", () => {
    const long = "You feel the heavy blanket on your legs, and the warm mug in your hands.";
    const segs = segmentLines([long]);
    const { pauseMsPerGap } = segmentsToPausedLines(segs);
    expect(pauseMsPerGap.every((ms) => ms === PAUSE_DEFAULTS.phraseMs)).toBe(true);
  });
});
