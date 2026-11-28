import { describe, expect, it } from "vitest";
import { cleanMix, DEFAULT_MIX, honoursPace, MIXABLE_VOICES, mixedOrder, mixVoiceAt, paceSupport, spreadVoices } from "@/lib/voiceMix";

describe("voice mix", () => {
  it("defaults to the voices that honour pace, which leaves out Nadine", () => {
    expect(DEFAULT_MIX.length).toBeGreaterThan(1);
    expect(DEFAULT_MIX).not.toContain("heygen-nadine");
    for (const id of DEFAULT_MIX) expect(honoursPace(MIXABLE_VOICES.find((v) => v.id === id)!)).toBe(true);
  });

  it("drops unknown and sample-only voices, and falls back to the default when nothing is left", () => {
    expect(cleanMix(["gemini-kore", "nope", "gemini-kore", "sesame-read-speech-a"])).toEqual(["gemini-kore"]);
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

describe("paceSupport", () => {
  it("marks only measured voices as honouring or ignoring pace", () => {
    expect(paceSupport({ model: "google/gemini-3.8-flash-lite-tts" })).toBe("honours");
    expect(paceSupport({ model: "heygen/heygen-voice-1-turbo" })).toBe("ignores");
    expect(paceSupport({ model: "hexgrad/kokoro-82m" })).toBe("untested");
  });
});

describe("mixedOrder", () => {
  const cycleRepeats = (o: number[], v: (i: number) => string) =>
    o.filter((x, k) => v(x) === v(o[(k + 1) % o.length])).length;

  it("starts at the tapped track and spreads the whole playlist, so Repeat all never plays a voice twice running", () => {
    // A,A,B,C: tapping track 3 used to leave A,A in the unspread prefix.
    const voices = ["A", "A", "B", "C"];
    const v = (i: number) => voices[i];
    const { order, start } = mixedOrder([0, 1, 2, 3], 2, false, v);
    expect(order[start]).toBe(2);
    expect([...order].sort()).toEqual([0, 1, 2, 3]);
    expect(cycleRepeats(order, v)).toBe(0);
  });

  it("checks the wrap from the last track to the first", () => {
    const voices = ["A", "B", "A", "B", "A", "C"];
    const v = (i: number) => voices[i];
    for (let from = 0; from < voices.length; from++) {
      const { order } = mixedOrder([0, 1, 2, 3, 4, 5], from, false, v);
      expect(order[0]).toBe(from);
      expect(cycleRepeats(order, v)).toBe(0);
    }
  });

  it("keeps a shuffled order's first track", () => {
    const v = (i: number) => ["A", "A", "B", "B"][i];
    const { order, start } = mixedOrder([3, 0, 2, 1], 0, true, v);
    expect(start).toBe(0);
    expect(order[0]).toBe(3);
    expect(cycleRepeats(order, v)).toBe(0);
  });
});
