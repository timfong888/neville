// Tests for the mock cost dashboard: aggregate totals consistency + auth gate.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (_: string) => undefined }),
}));

import {
  MOCK_DATA,
  RANGES,
  type Range,
  recordingsInRange,
  spendPerDay,
  topUsers,
  creditSummary,
  revenueVsCost,
} from "@/lib/mock/costData";

// --- Data consistency: aggregated totals must match table rows ---

describe("spendPerDay totals match recordingsInRange totals", () => {
  for (const range of RANGES) {
    it(`range ${range}`, () => {
      const recs = recordingsInRange(range);
      const expected = recs.reduce((s, r) => s + r.calls.reduce((cs, c) => cs + c.estUsd, 0), 0);
      const days = spendPerDay(range);
      const actual = days.reduce((s, d) => s + d.total, 0);
      expect(actual).toBeCloseTo(expected, 10);
    });
  }
});

describe("topUsers totals match recordingsInRange totals", () => {
  for (const range of RANGES) {
    it(`range ${range}`, () => {
      const recs = recordingsInRange(range);
      const expected = recs.reduce((s, r) => s + r.calls.reduce((cs, c) => cs + c.estUsd, 0), 0);
      const users = topUsers(range);
      const actual = users.reduce((s, u) => s + u.totalUsd, 0);
      expect(actual).toBeCloseTo(expected, 10);
    });
  }
});

describe("spendPerDay kind buckets add up to day total", () => {
  for (const range of RANGES) {
    it(`range ${range}`, () => {
      const days = spendPerDay(range);
      for (const d of days) {
        expect(d.script + d.speech + d.image).toBeCloseTo(d.total, 10);
      }
    });
  }
});

describe("revenueVsCost: cost side matches recordingsInRange total", () => {
  for (const range of RANGES) {
    it(`range ${range}`, () => {
      const recs = recordingsInRange(range);
      const expected = recs.reduce((s, r) => s + r.calls.reduce((cs, c) => cs + c.estUsd, 0), 0);
      const days = revenueVsCost(range);
      const actual = days.reduce((s, d) => s + d.cost, 0);
      expect(actual).toBeCloseTo(expected, 10);
    });
  }
});

describe("creditSummary: outstanding = bought - spent", () => {
  it("outstanding is non-negative", () => {
    const { bought, spent, outstanding } = creditSummary();
    expect(outstanding).toBeGreaterThanOrEqual(0);
    expect(outstanding).toBeCloseTo(Math.max(0, bought - spent), 10);
  });
});

describe("topUsers: recording count matches recordingsInRange", () => {
  for (const range of RANGES) {
    it(`range ${range}`, () => {
      const recs = recordingsInRange(range);
      const users = topUsers(range);
      const totalFromUsers = users.reduce((s, u) => s + u.recordings, 0);
      expect(totalFromUsers).toBe(recs.length);
    });
  }
});

// --- Auth: page returns 404 when ADMIN_TOKEN is not set ---

describe("mock page auth gate", () => {
  beforeAll(() => {
    delete process.env.ADMIN_TOKEN;
  });
  afterAll(() => {
    delete process.env.ADMIN_TOKEN;
  });

  it("throws NEXT_NOT_FOUND when ADMIN_TOKEN is not set", async () => {
    // Dynamically import AFTER env var is cleared so adminToken() reads the right value.
    const { default: MockUsagePage } = await import("@/app/admin/usage/mock/page");
    await expect(
      MockUsagePage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders login form when ADMIN_TOKEN is set but no cookie", async () => {
    process.env.ADMIN_TOKEN = "test-admin-token-long-enough-1234";
    // Re-import to pick up new env value (module cached, adminToken() reads env live).
    const { default: MockUsagePageAuthed } = await import("@/app/admin/usage/mock/page");
    // Should NOT throw — it returns the login form JSX instead.
    const result = await MockUsagePageAuthed({ searchParams: Promise.resolve({}) });
    // A React element is returned, not null and not an exception.
    expect(result).not.toBeNull();
    delete process.env.ADMIN_TOKEN;
  });
});
