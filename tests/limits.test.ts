import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import limits from "@/config/limits.json";

// lib/limits.ts keeps its counters in module state, so each test loads a fresh copy.
async function fresh() {
  vi.resetModules();
  return import("@/lib/limits");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-19T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("spend ceiling (the hard cap)", () => {
  it("allows recording below the ceiling", async () => {
    const { budgetVerdict } = await fresh();
    expect(budgetVerdict(0, 40)).toBeNull();
    expect(budgetVerdict(limits.spendCeilingUsd - 0.01, 40)).toBeNull();
  });
  it("refuses at and above the ceiling", async () => {
    const { budgetVerdict } = await fresh();
    expect(budgetVerdict(limits.spendCeilingUsd, 40)?.code).toBe("budget_spent");
    expect(budgetVerdict(limits.spendCeilingUsd + 5, 40)?.status).toBe(429);
  });
  it("refuses when the key has no credit left, even under the ceiling", async () => {
    const { budgetVerdict } = await fresh();
    expect(budgetVerdict(0.1, 0)?.code).toBe("budget_spent");
    expect(budgetVerdict(0.1, 0.02)?.code).toBe("budget_spent");
  });
  it("treats an unlimited key (no remaining figure) by the ceiling alone", async () => {
    const { budgetVerdict } = await fresh();
    expect(budgetVerdict(0.1, null)).toBeNull();
    expect(budgetVerdict(0.1, undefined)).toBeNull();
  });
  it("is set to two dollars", () => {
    expect(limits.spendCeilingUsd).toBe(2);
  });
});

describe("per-visitor counter (soft cap)", () => {
  it("refuses the request after the daily allowance", async () => {
    const { takeSlot } = await fresh();
    for (let i = 0; i < limits.perIpPerDay; i++) expect((await takeSlot("1.1.1.1")).refusal).toBeNull();
    expect((await takeSlot("1.1.1.1")).refusal?.code).toBe("visitor_full");
  });
  it("counts each visitor separately", async () => {
    const { takeSlot } = await fresh();
    for (let i = 0; i < limits.perIpPerDay; i++) await takeSlot("1.1.1.1");
    expect((await takeSlot("2.2.2.2")).refusal).toBeNull();
  });
  it("gives a slot back when nothing was spent", async () => {
    const { takeSlot } = await fresh();
    let last = await takeSlot("1.1.1.1");
    for (let i = 1; i < limits.perIpPerDay; i++) last = await takeSlot("1.1.1.1");
    await last.release();
    await last.release(); // twice gives back one slot, not two
    expect((await takeSlot("1.1.1.1")).refusal).toBeNull();
    expect((await takeSlot("1.1.1.1")).refusal?.code).toBe("visitor_full");
  });
  it("starts again the next day", async () => {
    const { takeSlot } = await fresh();
    for (let i = 0; i < limits.perIpPerDay; i++) await takeSlot("1.1.1.1");
    vi.setSystemTime(new Date("2026-11-20T00:00:05Z"));
    expect((await takeSlot("1.1.1.1")).refusal).toBeNull();
  });
});

describe("per-day counter (soft cap)", () => {
  it("refuses everyone once the day's total is reached", async () => {
    const { takeSlot } = await fresh();
    for (let i = 0; i < limits.globalPerDay; i++) expect((await takeSlot(`10.0.${i >> 8}.${i & 255}`)).refusal).toBeNull();
    expect((await takeSlot("9.9.9.9")).refusal?.code).toBe("day_full");
  });
});

describe("slot release and memory bounds", () => {
  it("releases the day it was taken, even after midnight", async () => {
    const { takeSlot, MemoryCounter } = await fresh();
    const c = new MemoryCounter();
    vi.setSystemTime(new Date("2026-11-19T23:59:59Z"));
    const slot = await takeSlot("1.1.1.1", c);
    vi.setSystemTime(new Date("2026-11-20T00:00:02Z"));
    await slot.release();
    // The new day is untouched: a full allowance, and no negative start.
    for (let i = 0; i < limits.perIpPerDay; i++) expect((await takeSlot("1.1.1.1", c)).refusal).toBeNull();
    expect((await takeSlot("1.1.1.1", c)).refusal?.code).toBe("visitor_full");
  });

  it("never drops the day's total when memory fills, and refused visitors leave no entry", async () => {
    const { takeSlot, MemoryCounter } = await fresh();
    const c = new MemoryCounter();
    for (let i = 0; i < limits.globalPerDay; i++) await takeSlot(`v${i}`, c);
    for (let i = 0; i < 25000; i++) expect((await takeSlot(`flood${i}`, c)).refusal?.code).toBe("day_full");
    expect(c.size()).toBeLessThan(limits.globalPerDay + 10);
    expect((await takeSlot("late", c)).refusal?.code).toBe("day_full");
  });

  it("memory also checks before counting: a full visitor's burst takes no share of the day", async () => {
    const { takeSlot, MemoryCounter, forgetDenied } = await fresh();
    const c = new MemoryCounter();
    for (let i = 0; i < limits.perIpPerDay; i++) await takeSlot("greedy", c);
    const burst = await Promise.all(Array.from({ length: 300 }, () => (forgetDenied(), takeSlot("greedy", c))));
    expect(burst.every((s) => s.refusal?.code === "visitor_full")).toBe(true);
    for (let i = 0; i < limits.globalPerDay - limits.perIpPerDay; i++) {
      expect((await takeSlot(`other${i}`, c)).refusal).toBeNull();
    }
    expect((await takeSlot("late", c)).refusal?.code).toBe("day_full");
  });
});
