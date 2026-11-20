import { describe, expect, it } from "vitest";
import { normalizeGainDb, normalizePcm16, PEAK_CEILING_DB, speechLoudness, TARGET_SPEECH_DB } from "@/lib/loudness";

const RATE = 16000;
/** Speech-like test signal: tone bursts at `amp`, with silences between. */
function bursts(amp: number, seconds = 3): ArrayBuffer {
  const s = new Int16Array(RATE * seconds);
  for (let i = 0; i < s.length; i++) {
    const t = i / RATE;
    s[i] = t % 1 < 0.6 ? Math.round(amp * 32767 * Math.sin(2 * Math.PI * 220 * t)) : 0;
  }
  return s.buffer;
}

describe("normalizePcm16", () => {
  it("brings a quiet and a loud voice to the same loudness, within 1 dB", () => {
    const quiet = speechLoudness(normalizePcm16(bursts(0.02), RATE), RATE).rmsDb;
    const loud = speechLoudness(normalizePcm16(bursts(0.5), RATE), RATE).rmsDb;
    expect(Math.abs(quiet - TARGET_SPEECH_DB)).toBeLessThan(1);
    expect(Math.abs(loud - TARGET_SPEECH_DB)).toBeLessThan(1);
  });

  it("measures speech, not the pauses between lines", () => {
    // A sine at 0.1 has RMS -23 dBFS; pauses must not drag it down.
    expect(speechLoudness(bursts(0.1), RATE).rmsDb).toBeCloseTo(-23, 0);
  });

  it("never passes the peak ceiling", () => {
    // A spiky file: one full-scale click in quiet speech.
    const s = new Int16Array(bursts(0.01));
    s[100] = 32767;
    const out = new Int16Array(normalizePcm16(s.buffer, RATE));
    const peak = Math.max(...Array.from(out, Math.abs)) / 32768;
    expect(20 * Math.log10(peak)).toBeLessThanOrEqual(PEAK_CEILING_DB + 0.01);
  });

  it("leaves silence silent and does not blow up near-silence", () => {
    expect(new Int16Array(normalizePcm16(new Int16Array(1600).buffer, RATE)).every((x) => x === 0)).toBe(true);
    expect(normalizeGainDb(-80, -70)).toBe(18);
  });
});
