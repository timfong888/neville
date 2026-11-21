// The browser side of share links: claiming around a move into an account,
// revoking on delete, and refusing to delete while links are switched off.
// SharePanel's helpers run here with a stand-in localStorage and fetch.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readHeld } from "@/lib/share";

vi.mock("server-only", () => ({}));

const store = new Map<string, string>();
const kv = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

type Call = { url: string; method: string; token: string | null; body: unknown };
let calls: Call[] = [];
let reply: (c: Call) => { status: number; body?: unknown } | Error;

beforeEach(() => {
  store.clear();
  calls = [];
  vi.stubGlobal("window", { localStorage: kv, location: { origin: "https://neville.test" } });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const c: Call = {
      url,
      method: init.method ?? "GET",
      token: headers.get("X-Owner-Token"),
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(c);
    const r = reply(c);
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  });
});
afterEach(() => vi.unstubAllGlobals());

const SHARE = "s".repeat(22);
const TOKEN = "t".repeat(43);
function hold(manifestationId: string, extra: object = {}) {
  kv.setItem(
    "nv_shares_v2",
    JSON.stringify({ [SHARE]: { shareId: SHARE, ownerToken: TOKEN, createdAt: 1, manifestationId, from: "device", ...extra } }),
  );
}
const panel = () => import("@/app/components/SharePanel");

describe("claiming links around a move into an account", () => {
  it("re-points a renamed item's link once the claim succeeds", async () => {
    hold("legacy-1");
    reply = () => ({ status: 200 });
    await (await panel()).claimHeldShares("u-a", { "legacy-1": "Y" });
    expect(calls).toEqual([{ url: `/api/share/${SHARE}`, method: "PATCH", token: TOKEN, body: { manifestationId: "Y" } }]);
    expect(readHeld(kv)).toEqual([{ shareId: SHARE, ownerToken: TOKEN, createdAt: 1, manifestationId: "Y", from: "account" }]);
  });

  it("when the claim fails, keeps the token and a pending re-point; deleting the account copy still revokes it; the next visit retries", async () => {
    const P = await panel();
    hold("legacy-1");
    reply = () => new Error("offline");
    await P.claimHeldShares("u-a", { "legacy-1": "Y" });
    expect(readHeld(kv)[0]).toMatchObject({ manifestationId: "legacy-1", renameTo: { userId: "u-a", manifestationId: "Y" } });

    // The device record is gone after the move; the account copy Y is deleted.
    reply = () => ({ status: 200 });
    calls = [];
    expect(await P.revokeShareFor("Y", { fromDevice: false })).toBe(true);
    expect(calls.map((c) => [c.method, c.url, c.token])).toEqual([
      ["DELETE", "/api/share?manifestation=Y", null],
      ["DELETE", `/api/share/${SHARE}`, TOKEN],
    ]);
    expect(readHeld(kv)).toEqual([]);
  });

  it("retries a pending re-point on the next signed-in visit, only for the same account", async () => {
    const P = await panel();
    hold("legacy-1", { renameTo: { userId: "u-a", manifestationId: "Y" } });
    reply = () => ({ status: 200 });
    await P.claimHeldShares("u-b");
    expect(calls[0].body).toEqual({ manifestationId: "legacy-1" }); // another account never sends Y
    expect(readHeld(kv)[0].renameTo).toBeDefined();
    calls = [];
    await P.claimHeldShares("u-a");
    expect(calls[0].body).toEqual({ manifestationId: "Y" });
    expect(readHeld(kv)[0]).toMatchObject({ manifestationId: "Y", from: "account" });
    expect(readHeld(kv)[0].renameTo).toBeUndefined();
  });

  it("a link another account owns (404) keeps its original id and token", async () => {
    hold("X");
    reply = () => ({ status: 404 });
    await (await panel()).claimHeldShares("u-b", { X: "Z" });
    expect(readHeld(kv)).toEqual([{ shareId: SHARE, ownerToken: TOKEN, createdAt: 1, manifestationId: "X", from: "device" }]);
  });
});

describe("deleting while public links are switched off", () => {
  it("refuses the delete and keeps the token", async () => {
    hold("m1");
    reply = (c) => (c.url.startsWith(`/api/share/${SHARE}`) ? { status: 503, body: { code: "links_off" } } : { status: 200, body: { revoked: 0 } });
    const P = await panel();
    expect(await P.revokeShareFor("m1", { fromDevice: true })).toBe(false);
    expect(await P.revokeAllShares(["m1"])).toBe(false);
    expect(readHeld(kv)).toHaveLength(1);
  });

  it("goes ahead once links are back", async () => {
    hold("m1");
    reply = () => ({ status: 200 });
    expect(await (await panel()).revokeShareFor("m1", { fromDevice: true })).toBe(true);
    expect(readHeld(kv)).toEqual([]);
  });
});

describe("DELETE /api/share/<id> without a database", () => {
  it("answers 503 links_off, never 404, so the client keeps its token", async () => {
    delete process.env.DATABASE_URL;
    const { DELETE } = await import("@/app/api/share/[id]/route");
    const res = await DELETE(new Request(`https://neville.test/api/share/${SHARE}`, { method: "DELETE", headers: { "X-Owner-Token": TOKEN } }), {
      params: Promise.resolve({ id: SHARE }),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "links_off" });
  });
});
