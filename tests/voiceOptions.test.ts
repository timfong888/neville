import { describe, expect, it } from "vitest";
import {
  CADENCE_OPTIONS,
  CURATED_VOICES,
  DEFAULT_CADENCE_STEP,
  DEFAULT_SPEED_STEP,
  SPEED_OPTIONS,
  resolveCadence,
  resolveSpeed,
  voiceOptionLabel,
} from "@/lib/voice/options";
import { parseRerecord } from "@/lib/rerecord";

describe("voice options — speed mapping", () => {
  it("maps each step to its speed value", () => {
    expect(resolveSpeed("slower").speed).toBe(0.78);
    expect(resolveSpeed("normal").speed).toBe(0.9);
    expect(resolveSpeed("faster").speed).toBe(1.05);
  });

  it("falls back to default for unknown ids", () => {
    expect(resolveSpeed("unknown").id).toBe(DEFAULT_SPEED_STEP);
    expect(resolveSpeed(null).id).toBe(DEFAULT_SPEED_STEP);
    expect(resolveSpeed(undefined).id).toBe(DEFAULT_SPEED_STEP);
  });

  it("default is slower (issue requirement: for relaxing)", () => {
    expect(DEFAULT_SPEED_STEP).toBe("slower");
  });
});

describe("voice options — cadence mapping", () => {
  it("maps each step to its pauseMs value", () => {
    expect(resolveCadence("short").pauseMs).toBe(900);
    expect(resolveCadence("natural").pauseMs).toBe(1500);
    expect(resolveCadence("long").pauseMs).toBe(2600);
  });

  it("falls back to default for unknown ids", () => {
    expect(resolveCadence("unknown").id).toBe(DEFAULT_CADENCE_STEP);
    expect(resolveCadence(null).id).toBe(DEFAULT_CADENCE_STEP);
  });
});

describe("voice options — curated list", () => {
  it("contains only recordable voices with existing samples", () => {
    expect(CURATED_VOICES.length).toBeGreaterThanOrEqual(4);
    for (const v of CURATED_VOICES) {
      expect(v.generate).toBe(true);
      expect(v.enabled).toBe(true);
      expect(v.sample).toMatch(/^\//);
    }
  });
});

describe("voice options — summary label", () => {
  it("formats as 'Name · Speed · Cadence'", () => {
    expect(voiceOptionLabel("Sulafat", "slower", "natural")).toBe("Sulafat · Slower · Natural");
    expect(voiceOptionLabel("Charon", "faster", "long")).toBe("Charon · Faster · Long pauses");
  });
});

describe("rerecord parseRerecord with speedStep / cadenceStep", () => {
  it("passes through valid speed and cadence steps", () => {
    const r = parseRerecord({ lines: ["You are calm."], voiceId: "gemini-sulafat", speedStep: "slower", cadenceStep: "natural" }, 700);
    expect(r).toEqual({
      ok: true,
      value: { lines: ["You are calm."], voiceId: "gemini-sulafat", speedStep: "slower", cadenceStep: "natural" },
    });
  });

  it("stores null for absent speed/cadence step fields", () => {
    const r = parseRerecord({ lines: ["You are calm."], voiceId: "x" }, 700);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.speedStep).toBeNull();
      expect(r.value.cadenceStep).toBeNull();
    }
  });

  it("rejects unknown values at the resolver level, not parse level (resolved on server)", () => {
    const r = parseRerecord({ lines: ["You are calm."], voiceId: "x", speedStep: "warp9" }, 700);
    expect(r.ok).toBe(true);
    // The route resolves it via resolveSpeed(), which falls back to default for bad ids.
    if (r.ok) expect(r.value.speedStep).toBe("warp9");
  });
});

describe("SPEED_OPTIONS and CADENCE_OPTIONS completeness", () => {
  it("all three speed steps are defined", () => {
    const ids = SPEED_OPTIONS.map((s) => s.id);
    expect(ids).toContain("slower");
    expect(ids).toContain("normal");
    expect(ids).toContain("faster");
  });

  it("all three cadence steps are defined", () => {
    const ids = CADENCE_OPTIONS.map((c) => c.id);
    expect(ids).toContain("short");
    expect(ids).toContain("natural");
    expect(ids).toContain("long");
  });
});
