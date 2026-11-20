import { describe, expect, it } from "vitest";
import { cleanMix, DEFAULT_MIX, honoursPace, MIXABLE_VOICES, mixVoiceAt, spreadVoices } from "@/lib/voiceMix";

describe("voice mix", () => {
  it("defaults to the voices that honour pace, which leaves out Nadine", () => {
    expect(DEFAULT_MIX.length).toBeGreaterThan(1);
    expect(DEFAULT_MIX).not.toContain("heygen-nadine");
    for (const id of DEFAULT_MIX) expect(honoursPace(MIXABLE_VOICES.find((v) => v.id === id)!)).toBe(true);
  });

  it("drops unknown and sample-only voices, and falls back to the default when nothing is left", () => {
    expect(cleanMix(["gemini-kore", "nope", "gemini-kore", "orpheus-tara"])).toEqual(["gemini-kore"]);
    expect(cleanMix([])).toEqual(DEFAULT_MIX);
    expect(cleanMix("x")).toEqual(DEFAULT_MIX);
  });

  it("rotates through the set", () => {
    // Rotation follows the order of config/voices.json.
    const m = cleanMix(["gemini-kore", "gemini-sulafat"]);
    const got = [0, 1, 2, 3].map((n) => mixVoiceAt(m, n));
    expect(got).toEqual([m[0], m[1], m[0], m[1]]);
    expect(new Set(got)).toEqual(new Set(["gemini-kore", "gemini-sulafat"]));
  });
});

describe("spreadVoices", () => {
  const voices = ["A", "A", "A", "B", "B", "C"];
  const voiceOf = (i: number) => voices[i];
  it("never plays the same voice twice in a row when it can be avoided", () => {
    const o = spreadVoices([0, 1, 2, 3, 4, 5], voiceOf);
    expect([...o].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(o[0]).toBe(0);
    for (let k = 1; k < o.length; k++) expect(voiceOf(o[k])).not.toBe(voiceOf(o[k - 1]));
  });
  it("leaves a single-voice playlist alone", () => {
    expect(spreadVoices([2, 0, 1], () => "A")).toEqual([2, 0, 1]);
  });
});
