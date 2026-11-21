import { describe, expect, it } from "vitest";
import { pauseFor, resolvePace, resolveTone, speedFor } from "@/lib/delivery";
import { MODES, resolveMode, SLEEP_FADE_S, sleepState } from "@/lib/modes";
import { DUCK_GAIN, musicGain, musicTrack } from "@/lib/music";

describe("modes", () => {
  it("every mode points at real presets and a bundled track", () => {
    for (const m of MODES) {
      expect(resolvePace(m.pace).id).toBe(m.pace);
      expect(resolveTone(m.tone).id).toBe(m.tone);
      expect(musicTrack(m.music)).not.toBeNull();
    }
  });

  it("Sleep is slower, quieter and more spaced than Calm; Active is the opposite", () => {
    const [calm, sleep, active] = ["calm", "sleep", "active"].map(resolveMode);
    const sp = (m: typeof calm) => speedFor(resolvePace(m.pace), resolveTone(m.tone));
    const pa = (m: typeof calm) => pauseFor(resolvePace(m.pace), resolveTone(m.tone));
    expect(sp(sleep)).toBeLessThan(sp(calm));
    expect(sp(active)).toBeGreaterThan(sp(calm));
    expect(pa(sleep)).toBeGreaterThan(pa(calm));
    expect(pa(active)).toBeLessThan(pa(calm));
    expect(sleep.volume).toBeLessThan(calm.volume);
    expect(active.volume).toBeGreaterThan(calm.volume);
    expect(sleep.gapMs).toBeGreaterThan(calm.gapMs);
    expect(active.gapMs).toBeLessThan(calm.gapMs);
    expect(sleep.fadeInS).toBeGreaterThan(calm.fadeInS);
    expect(sleep.sleepTimer).toBe(true);
  });

  it("unknown mode is Calm", () => {
    expect(resolveMode("party").id).toBe("calm");
  });
});

describe("sleepState", () => {
  const now = 1_000_000;
  it("plays, then fades for the last minute, then is over", () => {
    expect(sleepState(null, now).kind).toBe("off");
    expect(sleepState(now + 10 * 60_000, now).kind).toBe("playing");
    const f = sleepState(now + 30_000, now);
    expect(f.kind).toBe("fading");
    expect(f.left).toBeCloseTo(30);
    expect(sleepState(now + SLEEP_FADE_S * 1000 + 1, now).kind).toBe("playing");
    expect(sleepState(now - 1, now).kind).toBe("over");
  });
});

describe("mode voices", () => {
  it("Active records in Charon, a recordable voice that honours pace (#45)", async () => {
    const { resolveVoice } = await import("@/lib/voices");
    const { honoursPace } = await import("@/lib/voiceMix");
    const active = MODES.find((m) => m.id === "active")!;
    expect(active.voiceId).toBe("gemini-charon");
    const v = resolveVoice(active.voiceId);
    expect(v.id).toBe("gemini-charon");
    expect(honoursPace(v)).toBe(true);
  });
  it("Calm and Sleep keep whatever voice was chosen", () => {
    for (const m of MODES.filter((x) => x.id !== "active")) expect(m.voiceId).toBeUndefined();
  });
});

describe("Active's steady music", () => {
  it("only Active keeps the music undipped, about 14 dB down to sit ~13 dB under speech", () => {
    expect(MODES.filter((m) => !m.duck).map((m) => m.id)).toEqual(["active"]);
    // A steady bed is held at the dipped level.
    const db = 20 * Math.log10(musicGain(resolveMode("active").volume) * DUCK_GAIN);
    expect(db).toBeGreaterThan(-15);
    expect(db).toBeLessThan(-13);
  });
});
