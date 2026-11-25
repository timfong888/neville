import { describe, expect, it } from "vitest";
import { GAP_RATE, MAX_REPEATS, buildQueue, gapClip, repeatsFor, roundAt } from "@/lib/playerQueue";

describe("repeatsFor", () => {
  it("is zero when repetition is off", () => {
    expect(repeatsFor(40, 0)).toBe(0);
    expect(repeatsFor(40, -1)).toBe(0);
  });

  it("fills the chosen minutes with whole plays", () => {
    // 27 s voice + 3 s gap = 30 s a round; 3 minutes is 6 rounds.
    expect(repeatsFor(27, 3)).toBe(6);
    // A partial round is rounded up, so the session is never shorter than asked.
    expect(repeatsFor(40, 1)).toBe(2);
  });

  it("repeats at least once when the recording is longer than the minutes", () => {
    expect(repeatsFor(200, 1)).toBe(1);
  });

  it("uses a fallback length when the duration is unknown, and caps the queue", () => {
    expect(repeatsFor(0, 1)).toBe(2);
    expect(repeatsFor(Number.NaN, 1)).toBe(2);
    expect(repeatsFor(0.2, 10)).toBe(MAX_REPEATS);
  });
});

describe("gapClip", () => {
  const samples = (wav: Uint8Array) => new Int16Array(wav.buffer.slice(44));

  it("is a silent WAV of the gap length", () => {
    const wav = gapClip(false, 3000);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe("RIFF");
    const pcm = samples(wav);
    expect(pcm.length).toBe(GAP_RATE * 3);
    expect(pcm.every((s) => s === 0)).toBe(true);
  });

  it("starts with the bell when it is on, and has the same length", () => {
    const pcm = samples(gapClip(true, 3000));
    expect(pcm.length).toBe(GAP_RATE * 3);
    expect(pcm.subarray(0, GAP_RATE).some((s) => Math.abs(s) > 1000)).toBe(true);
    // The bell has died away by the end, so the next play starts from silence.
    expect(pcm.subarray(pcm.length - 2000).every((s) => Math.abs(s) < 200)).toBe(true);
  });

  it("cuts the bell when the gap is shorter than it", () => {
    expect(samples(gapClip(true, 500)).length).toBe(Math.round(GAP_RATE * 0.5));
  });
});

describe("buildQueue and roundAt", () => {
  it("plays the voice once when repetition is off", () => {
    expect(buildQueue("v", "g", 0)).toEqual(["v"]);
  });

  it("alternates voice and gap and ends on the voice", () => {
    expect(buildQueue("v", "g", 2)).toEqual(["v", "g", "v", "g", "v"]);
  });

  it("names the play a position belongs to", () => {
    expect(roundAt(0)).toEqual({ round: 1, inGap: false });
    expect(roundAt(1)).toEqual({ round: 1, inGap: true });
    expect(roundAt(4)).toEqual({ round: 3, inGap: false });
  });
});
