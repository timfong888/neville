import { describe, expect, it } from "vitest";
import { planSession } from "@/lib/session/planSession";

const NOW = new Date("2026-01-01T10:00:00Z");

describe("planSession — until-stopped", () => {
  it("returns nulls", () => {
    const p = planSession([200], "until-stopped", 0, NOW);
    expect(p).toEqual({ loops: null, totalSeconds: null, endsAt: null });
  });

  it("returns nulls even with a target", () => {
    const p = planSession([200], "until-stopped", 10, NOW);
    expect(p.loops).toBeNull();
  });
});

describe("planSession — loops mode", () => {
  it("plays the exact number of loops", () => {
    const p = planSession([200], "loops", 5, NOW);
    expect(p.loops).toBe(5);
    expect(p.totalSeconds).toBe(1000);
  });

  it("clamps to 1 at the low end", () => {
    expect(planSession([200], "loops", 0, NOW).loops).toBe(1);
  });

  it("clamps to MAX_LOOPS at the high end", () => {
    expect(planSession([200], "loops", 99, NOW).loops).toBe(20);
  });

  it("sets endsAt from now", () => {
    const p = planSession([200], "loops", 1, NOW);
    expect(p.endsAt?.getTime()).toBe(NOW.getTime() + 200_000);
  });
});

describe("planSession — time mode", () => {
  it("10 min target, 3:20 item → 3 loops (10:00)", () => {
    // 200 s × 3 = 600 s = 10:00
    const p = planSession([200], "time", 10, NOW);
    expect(p.loops).toBe(3);
    expect(p.totalSeconds).toBe(600);
  });

  it("9 min target, 3:20 item → 2 loops (6:40)", () => {
    // floor(540 / 200) = 2
    const p = planSession([200], "time", 9, NOW);
    expect(p.loops).toBe(2);
    expect(p.totalSeconds).toBe(400);
  });

  it("item longer than target → plays once", () => {
    // 7 min item, 5 min target: floor(300 / 420) = 0 → clamp to 1
    const p = planSession([420], "time", 5, NOW);
    expect(p.loops).toBe(1);
    expect(p.totalSeconds).toBe(420);
  });

  it("sets endsAt proportionally", () => {
    const p = planSession([200], "time", 10, NOW);
    expect(p.endsAt?.getTime()).toBe(NOW.getTime() + 600_000);
  });

  it("empty durations array returns until-stopped plan", () => {
    const p = planSession([], "time", 10, NOW);
    expect(p.loops).toBeNull();
  });

  it("boundary: recording that fits exactly N loops without trailing gap", () => {
    // 299 s voice + 1.8 s gap = 300.8 s loopDur
    // 2 actual loops = 2×299 + 1×1.8 = 599.8 s ≤ 600 s (10 min) → should give 2 loops
    // Without trailingGapSec: floor(600 / 300.8) = 1 (off by one bug)
    // With trailingGapSec=1.8: floor(601.8 / 300.8) = 2 ✓
    const p = planSession([300.8], "time", 10, NOW, 1.8);
    expect(p.loops).toBe(2);
    expect(p.totalSeconds).toBe(601.6);
  });
});

describe("planSession — library time-mode clip integration", () => {
  it("clips with trailing gap stripped do not exceed the chosen target", () => {
    // durationSec from playAll includes a trailing gap (loopQueue appends gap after every item)
    // 299 s voice + 1.8 s gap = 300.8 s per pass
    const gapSec = 1.8;
    const voiceSec = 299;
    const durationSec = voiceSec + gapSec; // 300.8 — what playAll.durationSec returns
    const plan = planSession([durationSec], "time", 10, NOW, gapSec);
    expect(plan.loops).toBe(2);
    // Simulate library.tsx: N copies of [voice, gap], then slice off the trailing gap
    type Clip = { name: string; sec: number };
    const pass: Clip[] = [{ name: "voice", sec: voiceSec }, { name: "gap", sec: gapSec }];
    const allClips = Array.from({ length: plan.loops! }, () => pass).flat();
    const clips = allClips.length > 0 ? allClips.slice(0, -1) : allClips;
    const totalSec = clips.reduce((s, c) => s + c.sec, 0);
    expect(totalSec).toBeCloseTo(voiceSec * 2 + gapSec, 10); // 599.8 s
    expect(totalSec).toBeLessThanOrEqual(10 * 60); // must not exceed 10-min target
  });
});
