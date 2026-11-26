import { describe, expect, it, vi } from "vitest";
import { budgetLevel, newAlert, sameSecret, speechCost, totals } from "@/lib/ledger";

describe("budget alerts", () => {
  it("maps usage to 0, 50, 80 or 100% of the ceiling", () => {
    expect(budgetLevel(0.99, 2)).toBe(0);
    expect(budgetLevel(1, 2)).toBe(50);
    expect(budgetLevel(1.59, 2)).toBe(50);
    expect(budgetLevel(1.6, 2)).toBe(80);
    expect(budgetLevel(2, 2)).toBe(100);
    expect(budgetLevel(9, 2)).toBe(100);
    expect(budgetLevel(1, 0)).toBe(0);
    expect(budgetLevel(Number.NaN, 2)).toBe(0);
  });

  it("alerts each level once, and jumps straight to the highest reached", () => {
    expect(newAlert(0, 0.5, 2)).toBeNull();
    expect(newAlert(0, 1.1, 2)).toBe(50);
    expect(newAlert(50, 1.2, 2)).toBeNull();
    expect(newAlert(50, 2.1, 2)).toBe(100);
    expect(newAlert(0, 1.7, 2)).toBe(80);
    expect(newAlert(100, 3, 2)).toBeNull();
  });
});

describe("ledger sums", () => {
  it("prices per character and counts unpriced calls", () => {
    expect(speechCost(500, 6)).toBeCloseTo(0.003);
    expect(speechCost(500, null)).toBeNull();
    const t = totals([
      { at: 1, route: "manifest", kind: "speech", model: "m", chars: 500, estUsd: 0.003 },
      { at: 2, route: "manifest", kind: "script", model: "t", chars: 600, estUsd: null },
    ]);
    expect(t).toEqual({ calls: 2, chars: 1100, estUsd: 0.003, unpriced: 1, failed: 0 });
    expect(totals([{ at: 3, route: "rerecord", kind: "speech", model: "m", chars: 10, estUsd: null, ok: false }]).failed).toBe(1);
  });
});

describe("admin token", () => {
  it("matches only the exact, non-empty secret", () => {
    expect(sameSecret("abc123", "abc123")).toBe(true);
    expect(sameSecret("abc124", "abc123")).toBe(false);
    expect(sameSecret("abc", "abc123")).toBe(false);
    expect(sameSecret("", "")).toBe(false);
  });
});

describe("script ledger line (#176)", () => {
  it("carries the script's source and model id", async () => {
    vi.doMock("server-only", () => ({}));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { record } = await import("@/lib/server/ledger");
    await record({ route: "manifest", kind: "script", source: "model", model: "google/gemini-2.5-flash-lite", chars: 120, estUsd: null });
    const line = info.mock.calls.find((c) => c[0] === "[ledger]");
    info.mockRestore();
    expect(JSON.parse(String(line?.[1]))).toMatchObject({ kind: "script", source: "model", model: "google/gemini-2.5-flash-lite" });
  });
});
