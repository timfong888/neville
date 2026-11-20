import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_MUSIC,
  MUSIC_TRACKS,
  musicGain,
  resolveMusic,
  rmsFrames,
  speechSegments,
} from "@/lib/music";

describe("music tracks", () => {
  it("every track file is bundled and its loop sits inside the file", () => {
    for (const t of MUSIC_TRACKS) {
      const path = join(__dirname, "..", "public", t.src);
      expect(existsSync(path), t.src).toBe(true);
      expect(t.loopStart).toBeGreaterThan(0);
      expect(t.loopEnd - t.loopStart).toBeGreaterThan(30);
    }
  });

  it("the license file names every track", () => {
    const lic = readFileSync(join(__dirname, "..", "public", "music", "LICENSE.md"), "utf8");
    expect(lic).toContain("CC0");
    for (const t of MUSIC_TRACKS) expect(lic).toContain(t.src.split("/").pop()!);
  });

  it("resolves unknown ids to the default and keeps 'none'", () => {
    expect(resolveMusic("none")).toBe("none");
    expect(resolveMusic("rise")).toBe("rise");
    expect(resolveMusic("buzz")).toBe(DEFAULT_MUSIC);
    expect(resolveMusic(undefined)).toBe(DEFAULT_MUSIC);
  });
});

describe("musicGain", () => {
  it("is silent at 0 and never louder than -14 dB", () => {
    expect(musicGain(0)).toBe(0);
    expect(20 * Math.log10(musicGain(1))).toBeCloseTo(-14, 0);
    expect(musicGain(5)).toBe(musicGain(1));
  });

  it("rises with the slider", () => {
    expect(musicGain(0.3)).toBeLessThan(musicGain(0.6));
    expect(musicGain(0.6)).toBeLessThan(musicGain(1));
  });
});

describe("speechSegments", () => {
  const hop = 0.05;
  // 1 s silence, 2 s speech with a 0.3 s breath in it, 3 s pause, 1 s speech.
  const frames = (spec: [number, number][]) => spec.flatMap(([sec, level]) => Array(Math.round(sec / hop)).fill(level));

  it("joins short breaths and keeps long pauses apart", () => {
    const rms = frames([[1, 0], [1, 0.2], [0.3, 0], [0.7, 0.2], [3, 0], [1, 0.1]]);
    const s = speechSegments(rms, hop);
    expect(s).toHaveLength(2);
    expect(s[0].start).toBeCloseTo(1, 2);
    expect(s[0].end).toBeCloseTo(3, 2);
    expect(s[1].start).toBeCloseTo(6, 2);
  });

  it("finds nothing in silence and drops blips", () => {
    expect(speechSegments(frames([[2, 0]]), hop)).toEqual([]);
    expect(speechSegments(frames([[1, 0], [0.05, 0.3], [1, 0]]), hop)).toEqual([]);
  });

  it("rmsFrames measures a steady tone", () => {
    const rate = 8000;
    const x = Array.from({ length: rate }, (_, i) => Math.sin((2 * Math.PI * 200 * i) / rate));
    const r = rmsFrames(x, rate, 0.1);
    expect(r).toHaveLength(10);
    expect(r[3]).toBeCloseTo(Math.SQRT1_2, 2);
  });
});
