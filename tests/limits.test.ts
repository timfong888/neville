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
    for (let i = 0; i < limits.perIpPerDay; i++) expect(takeSlot("1.1.1.1")).toBeNull();
    expect(takeSlot("1.1.1.1")?.code).toBe("visitor_full");
  });
  it("counts each visitor separately", async () => {
    const { takeSlot } = await fresh();
    for (let i = 0; i < limits.perIpPerDay; i++) takeSlot("1.1.1.1");
    expect(takeSlot("2.2.2.2")).toBeNull();
  });
  it("gives a slot back when nothing was spent", async () => {
    const { takeSlot, returnSlot } = await fresh();
    for (let i = 0; i < limits.perIpPerDay; i++) takeSlot("1.1.1.1");
    returnSlot("1.1.1.1");
    expect(takeSlot("1.1.1.1")).toBeNull();
    expect(takeSlot("1.1.1.1")?.code).toBe("visitor_full");
  });
  it("starts again the next day", async () => {
    const { takeSlot } = await fresh();
    for (let i = 0; i < limits.perIpPerDay; i++) takeSlot("1.1.1.1");
    vi.setSystemTime(new Date("2026-11-20T00:00:05Z"));
    expect(takeSlot("1.1.1.1")).toBeNull();
  });
});

describe("per-day counter (soft cap)", () => {
  it("refuses everyone once the day's total is reached", async () => {
    const { takeSlot } = await fresh();
    for (let i = 0; i < limits.globalPerDay; i++) expect(takeSlot(`10.0.${i >> 8}.${i & 255}`)).toBeNull();
    expect(takeSlot("9.9.9.9")?.code).toBe("day_full");
  });
});
