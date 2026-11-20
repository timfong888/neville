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
  it("never speeds up and never goes below the floor", () => {
    for (const p of PACES) for (const t of TONES) {
      const s = speedFor(p, t);
      expect(s).toBeGreaterThanOrEqual(0.6);
      expect(s).toBeLessThan(1);
    }
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
