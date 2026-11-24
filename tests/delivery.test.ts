import { describe, expect, it } from "vitest";
import {
  DEFAULT_PACE_ID,
  DEFAULT_TONE_ID,
  MAX_AUDIO_BYTES,
  PACES,
  TONES,
  fitPause,
  pauseFor,
  resolvePace,
  resolveTone,
  silenceBytes,
  silentRuns,
  splitAtPauses,
  piecesFitLines,
  speechBounds,
  speedFor,
  startShares,
  stitchPcm,
  styleInstruction,
} from "@/lib/delivery";

describe("presets", () => {
  it("resolves ids and falls back to the defaults", () => {
    expect(resolvePace("very-slow").id).toBe("very-slow");
    expect(resolvePace("fast").id).toBe(DEFAULT_PACE_ID);
    expect(resolvePace(undefined).id).toBe(DEFAULT_PACE_ID);
    expect(resolveTone("sleep").id).toBe("sleep");
    expect(resolveTone({ id: "calm" }).id).toBe(DEFAULT_TONE_ID);
  });
  it("defaults to slow and calm", () => {
    expect([DEFAULT_PACE_ID, DEFAULT_TONE_ID]).toEqual(["slow", "calm"]);
  });
  it("never speeds up except Brisk, and never goes below the floor", () => {
    for (const p of PACES) for (const t of TONES) {
      const s = speedFor(p, t);
      expect(s).toBeGreaterThanOrEqual(0.6);
      if (p.id === "brisk") expect(s).toBeLessThanOrEqual(1.1);
      else expect(s).toBeLessThan(1);
    }
  });
  it("Energetic lifts the energy instead of lowering it", () => {
    const i = styleInstruction(resolvePace("brisk"), resolveTone("energetic"));
    expect(i).toMatch(/brisk/);
    expect(i).not.toMatch(/keep your energy low/);
    expect(i).toMatch(/never shout/);
  });
  it("very slow and sleep are each slower than their alternatives", () => {
    const calm = resolveTone("calm");
    expect(speedFor(resolvePace("very-slow"), calm)).toBeLessThan(speedFor(resolvePace("slow"), calm));
    expect(pauseFor(resolvePace("very-slow"), calm)).toBeGreaterThan(pauseFor(resolvePace("slow"), calm));
    const slow = resolvePace("slow");
    expect(pauseFor(slow, resolveTone("sleep"))).toBeGreaterThan(pauseFor(slow, calm));
  });
  it("writes an instruction that names the pace and tone and never asks for emphasis", () => {
    const i = styleInstruction(resolvePace("very-slow"), resolveTone("soft"));
    expect(i).toMatch(/very slowly/);
    expect(i).toMatch(/whisper/);
    expect(i).toMatch(/Do not sound excited/);
  });
});

describe("silence and stitching", () => {
  it("sizes silence as 16-bit mono samples", () => {
    expect(silenceBytes(1000, 22050)).toBe(44100);
    expect(silenceBytes(0, 22050)).toBe(0);
  });
  it("joins pieces with silence between them, not after the last", () => {
    const a = new Uint8Array([1, 1]).buffer;
    const b = new Uint8Array([2, 2, 2, 2]).buffer;
    const out = new Uint8Array(stitchPcm([a, b], 6));
    expect([...out]).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2]);
    expect(stitchPcm([a], 6).byteLength).toBe(2);
  });
  it("finds line starts as a share of the whole, pauses included", () => {
    expect(startShares([100, 100], 100)).toEqual([0, 0.6667]);
    expect(startShares([], 10)).toEqual([]);
  });
});

describe("fitPause", () => {
  it("keeps the pause when the file fits", () => {
    expect(fitPause({ pauseMs: 1500, gaps: 10, speechBytes: 1_000_000, rate: 22050 })).toBe(1500);
  });
  it("shrinks the pauses so the file stays under the response limit", () => {
    const speechBytes = 2_500_000;
    const ms = fitPause({ pauseMs: 4000, gaps: 11, speechBytes, rate: 22050 });
    expect(ms).toBeLessThan(4000);
    const total = 44 + speechBytes + silenceBytes(ms, 22050) * 11;
    expect(total).toBeLessThanOrEqual(MAX_AUDIO_BYTES);
  });
  it("drops the pauses to nothing rather than break the size limit, and handles one line", () => {
    expect(fitPause({ pauseMs: 4000, gaps: 11, speechBytes: 3_999_950, rate: 22050 })).toBe(0);
    expect(fitPause({ pauseMs: 4000, gaps: 11, speechBytes: 9_000_000, rate: 22050 })).toBe(0);
    expect(fitPause({ pauseMs: 4000, gaps: 0, speechBytes: 1000, rate: 22050 })).toBe(0);
  });
  it("always lands at or under the limit when the speech itself fits", () => {
    for (const speechBytes of [500_000, 2_000_000, 3_000_000, 3_900_000]) {
      const ms = fitPause({ pauseMs: 4000, gaps: 11, speechBytes, rate: 22050 });
      expect(44 + speechBytes + silenceBytes(ms, 22050) * 11).toBeLessThanOrEqual(MAX_AUDIO_BYTES);
    }
  });
});

describe("splitAtPauses (#76)", () => {
  const rate = 8000;
  // Speech (a loud square wave) and silence, in ms.
  function signal(parts: Array<[boolean, number]>): ArrayBuffer {
    const n = parts.reduce((s, [, ms]) => s + (rate * ms) / 1000, 0);
    const out = new Int16Array(n);
    let at = 0;
    for (const [loud, ms] of parts) {
      const len = (rate * ms) / 1000;
      for (let i = 0; i < len; i++) out[at + i] = loud ? (i % 20 < 10 ? 8000 : -8000) : 0;
      at += len;
    }
    return out.buffer;
  }

  it("cuts at the longest silences, one piece per line", () => {
    // Three lines; a short breath inside line 2; long pauses between lines.
    const pcm = signal([[true, 800], [false, 900], [true, 400], [false, 300], [true, 400], [false, 1200], [true, 700]]);
    const pieces = splitAtPauses(pcm, rate, 3)!;
    expect(pieces).toHaveLength(3);
    const ms = pieces.map((p) => (p.byteLength / 2 / rate) * 1000);
    // Line 2 keeps its inner breath; every line keeps its speech.
    expect(ms[0]).toBeGreaterThanOrEqual(800);
    expect(ms[1]).toBeGreaterThanOrEqual(1100);
    expect(ms[2]).toBeGreaterThanOrEqual(700);
    // The long pauses are mostly gone, ready to be set to the pace's length.
    expect(ms.reduce((a, b) => a + b, 0)).toBeLessThan(4700 - 1500);
  });

  it("does not trust cuts that land mid-sentence", () => {
    // Line 1 has a long breath inside it; the pause after line 2 was under-honoured.
    const pcm = signal([[true, 400], [false, 1500], [true, 400], [false, 900], [true, 1200], [false, 400], [true, 1200]]);
    // The two longest silences would split line 1 and join lines 2 and 3.
    const naive = splitAtPauses(pcm, rate, 3)!.map((p) => (p.byteLength / 2 / rate) * 1000);
    expect(naive[2]).toBeGreaterThan(2500);
    // With the words per line, the cuts fall at the real line ends: the breath stays in line 1.
    const ms = splitAtPauses(pcm, rate, 3, [30, 30, 30])!.map((p) => (p.byteLength / 2 / rate) * 1000);
    expect(ms[0]).toBeGreaterThanOrEqual(2300);
    expect(ms[1]).toBeGreaterThanOrEqual(1200);
    expect(ms[1]).toBeLessThan(1500);
    expect(ms[2]).toBeGreaterThanOrEqual(1200);
    expect(ms[2]).toBeLessThan(1400);
  });

  it("cuts at the real line ends on a longer script with a breath and a missed pause", () => {
    // 9 lines of 1200 ms speech with 1200 ms pauses; line 3 has a 1300 ms breath
    // in the middle, and the pause after line 6 is only 400 ms (Sinatra's case on #81).
    const parts: Array<[boolean, number]> = [];
    for (let i = 1; i <= 9; i++) {
      if (i === 3) parts.push([true, 600], [false, 1300], [true, 600]);
      else parts.push([true, 1200]);
      if (i < 9) parts.push([false, i === 6 ? 400 : 1200]);
    }
    const ms = splitAtPauses(signal(parts), rate, 9, Array(9).fill(30))!.map((p) => Math.round((p.byteLength / 2 / rate) * 1000));
    expect(ms).toHaveLength(9);
    // Line 3 keeps its breath; lines 6 and 7 are separate.
    expect(ms[2]).toBeGreaterThanOrEqual(2500);
    for (const i of [0, 1, 3, 4, 5, 6, 7, 8]) {
      expect(ms[i]).toBeGreaterThanOrEqual(1200);
      expect(ms[i]).toBeLessThan(1500);
    }
  });

  it("ignores silence before the first word and after the last when placing cuts", () => {
    // Sinatra's cases on #81: 9 lines of 1.2 s with 1.2 s pauses, plus edge silence.
    const build = (lead: number, tail: number, breathInLast: boolean) => {
      const parts: Array<[boolean, number]> = lead ? [[false, lead]] : [];
      for (let i = 1; i <= 9; i++) {
        if (i === 9 && breathInLast) parts.push([true, 600], [false, 300], [true, 600]);
        else parts.push([true, 1200]);
        if (i < 9) parts.push([false, 1200]);
      }
      if (tail) parts.push([false, tail]);
      return signal(parts);
    };
    for (const [lead, tail, breath] of [[0, 600, true], [0, 1000, false], [500, 800, true]] as const) {
      const pieces = splitAtPauses(build(lead, tail, breath), rate, 9, Array(9).fill(30));
      expect(pieces, `lead ${lead} tail ${tail} breath ${breath}`).not.toBeNull();
      const ms = pieces!.map((p) => Math.round((p.byteLength / 2 / rate) * 1000));
      // Every piece is one line: about 1.2 s of speech plus kept silence (and edge silence at the ends).
      for (let i = 1; i < 8; i++) {
        expect(ms[i]).toBeGreaterThanOrEqual(1200);
        expect(ms[i]).toBeLessThan(1500);
      }
      expect(ms[8]).toBeGreaterThanOrEqual(1200 + (breath ? 300 : 0));
    }
  });

  it("finds where the sound starts and ends", () => {
    const pcm = new Int16Array(signal([[false, 500], [true, 1000], [false, 700]]));
    const [a, b] = speechBounds(pcm, rate);
    expect(Math.abs(a - rate * 0.5)).toBeLessThanOrEqual(rate * 0.02);
    expect(Math.abs(b - rate * 1.5)).toBeLessThanOrEqual(rate * 0.02);
  });

  it("checks each piece against its line's share of the words", () => {
    expect(piecesFitLines([100, 100, 30], [30, 30, 10])).toBe(true);
    expect(piecesFitLines([100, 100, 5], [30, 30, 30])).toBe(false);
    expect(piecesFitLines([52, 58, 271], [30, 30, 30])).toBe(false);
  });

  it("gives null when there are too few pauses to cut at", () => {
    expect(splitAtPauses(signal([[true, 1000], [false, 400], [true, 1000]]), rate, 4)).toBeNull();
  });

  it("finds silent runs of at least the minimum length", () => {
    const pcm = new Int16Array(signal([[true, 500], [false, 200], [true, 500], [false, 600], [true, 500]]));
    expect(silentRuns(pcm, rate).length).toBe(1);
  });
});
