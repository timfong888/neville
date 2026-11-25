// /s/<id> reads the share once per visit: generateMetadata and the page both
// need it, and load() is wrapped in React's cache() so they share one read.
// Outside a React server render cache() does not memoise, so this stands in a
// per-request memo for it and checks the page goes through it.
import { beforeEach, describe, expect, it, vi } from "vitest";

const getShare = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("react", async (orig) => {
  const real = await orig<typeof import("react")>();
  return {
    ...real,
    cache: <A extends unknown[], R>(fn: (...a: A) => R) => {
      const seen = new Map<string, R>();
      return (...a: A) => {
        const k = JSON.stringify(a);
        if (!seen.has(k)) seen.set(k, fn(...a));
        return seen.get(k) as R;
      };
    },
  };
});
vi.mock("@/lib/server/db", () => ({ dbConfigured: () => true, getPool: () => ({}) }));
vi.mock("@/lib/server/shareDb", () => ({ getShare: (...a: unknown[]) => getShare(...a) }));
vi.mock("@/app/components/PlaylistPlayer", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const ID = "s".repeat(22);
const params = () => ({ params: Promise.resolve({ id: ID }) });

beforeEach(() => {
  vi.resetModules();
  getShare.mockReset().mockResolvedValue({ id: ID, title: "Calm", lines: ["Breathe."], voiceName: "", createdAt: 1 });
});

describe("/s/<id>", () => {
  it("reads the share from the database once for metadata and page together", async () => {
    const mod = await import("@/app/s/[id]/page");
    const meta = await mod.generateMetadata(params());
    expect(meta.title).toBe("Calm — Neville");
    await mod.default(params());
    expect(getShare).toHaveBeenCalledTimes(1);
  });

  it("an unknown link is a 404, still with one read", async () => {
    getShare.mockResolvedValue(null);
    const mod = await import("@/app/s/[id]/page");
    expect((await mod.generateMetadata(params())).title).toBe("Not found — Neville");
    await expect(mod.default(params())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getShare).toHaveBeenCalledTimes(1);
  });
});
