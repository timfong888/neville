import { describe, expect, it } from "vitest";
import { lineAt, lineForProgress } from "@/lib/create";
import { lineStarts } from "@/lib/audio";

const LINES = ["I am calm and confident.", "My mind is clear.", "I deserve good things."];

describe("lineStarts", () => {
  it("first line always starts at 0", () => {
    const s = lineStarts(LINES);
    expect(s[0]).toBe(0);
  });

  it("produces one start per line", () => {
    expect(lineStarts(LINES)).toHaveLength(LINES.length);
  });

  it("starts are strictly increasing", () => {
    const s = lineStarts(LINES);
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1]);
  });

  it("handles a single line", () => {
    expect(lineStarts(["one line"])).toEqual([0]);
  });
});

describe("lineAt", () => {
  it("returns 0 at progress 0", () => {
    expect(lineAt([0, 0.4, 0.75], 0)).toBe(0);
  });

  it("advances when progress crosses the next start", () => {
    expect(lineAt([0, 0.4, 0.75], 0.4)).toBe(1);
    expect(lineAt([0, 0.4, 0.75], 0.75)).toBe(2);
  });

  it("stays on the last line past 1", () => {
    expect(lineAt([0, 0.4, 0.75], 0.99)).toBe(2);
  });
});

describe("lineForProgress", () => {
  const starts = lineStarts(LINES);

  it("returns a line index for even (recording) clip indices", () => {
    expect(lineForProgress(0, 0, starts)).toBe(0);
    expect(lineForProgress(2, 0, starts)).toBe(0);
    expect(lineForProgress(4, 0, starts)).toBe(0);
  });

  it("returns null for odd (gap) clip indices", () => {
    expect(lineForProgress(1, 0.5, starts)).toBeNull();
    expect(lineForProgress(3, 0.5, starts)).toBeNull();
  });

  it("advances the line as progress increases on a voice clip", () => {
    const s = lineStarts(LINES);
    // Progress just past the second line's start → line 1
    expect(lineForProgress(0, s[1] + 0.001, starts)).toBe(1);
    // Progress just past the third line's start → line 2
    expect(lineForProgress(0, s[2] + 0.001, starts)).toBe(2);
  });

  it("works the same regardless of which voice clip round (loop-safe)", () => {
    const atStart = lineForProgress(0, 0, starts);
    expect(lineForProgress(2, 0, starts)).toBe(atStart);
    expect(lineForProgress(100, 0, starts)).toBe(atStart);
  });
});
