// DELETE /api/account: the Apple grant is revoked before the rows go, and a failure to revoke
// never stops the deletion (#98).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const steps: string[] = [];
let revoke: (o: { code?: string }) => Promise<string>;
let user: { id: string } | null;

vi.mock("@/lib/server/accounts", () => ({
  PRIMARY_ORIGIN: "https://getneville.vercel.app",
  LEGACY_ORIGINS: [],
  accountsEnabled: () => true,
  missingVars: () => [],
  signInProviders: () => ["apple"],
  currentUser: async () => user,
  appleClients: () => ({ web: null, app: null }),
  appleLinks: async () => (steps.push("links"), [{ accountId: "apple-user-1", refreshToken: null, accessToken: null }]),
  withTx: async (fn: (db: unknown) => Promise<unknown>) => fn({}),
  purgeAudio: async () => (steps.push("purge"), 0),
}));
vi.mock("@/lib/server/libraryDb", () => ({
  deleteAccount: async () => (steps.push("delete"), ["audio/k"]),
  addTombstones: async () => undefined,
}));
vi.mock("@/lib/server/appleRevoke", async (orig) => ({
  ...(await orig<typeof import("@/lib/server/appleRevoke")>()),
  revokeAppleGrants: (o: { code?: string }) => (steps.push(`revoke:${o.code ?? "-"}`), revoke(o)),
}));

const del = (origin: string | null, body?: unknown) =>
  new Request("https://getneville.vercel.app/api/account", {
    method: "DELETE",
    headers: { ...(origin ? { origin } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

beforeEach(() => {
  steps.length = 0;
  user = { id: "u1" };
  revoke = async () => "revoked";
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("DELETE /api/account with Sign in with Apple revocation", () => {
  it("revokes with the app's code first, then deletes", async () => {
    const { DELETE } = await import("@/app/api/account/route");
    const res = await DELETE(del("neville://", { appleAuthorizationCode: "c.1" }));
    expect(await res.json()).toEqual({ ok: true, audioPending: 0, apple: "revoked" });
    expect(steps).toEqual(["links", "revoke:c.1", "delete", "purge"]);
  });

  it("still deletes when Apple cannot be reached, and when the lookup throws", async () => {
    const { DELETE } = await import("@/app/api/account/route");
    revoke = async () => "failed";
    expect(await (await DELETE(del("https://getneville.vercel.app"))).json()).toMatchObject({ ok: true, apple: "failed" });
    revoke = async () => {
      throw new Error("boom");
    };
    expect(await (await DELETE(del("https://getneville.vercel.app"))).json()).toMatchObject({ ok: true, apple: "failed" });
    expect(steps.filter((s) => s === "delete")).toHaveLength(2);
  });

  it("refuses a foreign origin or a signed-out request before touching Apple or the database", async () => {
    const { DELETE } = await import("@/app/api/account/route");
    expect((await DELETE(del("https://evil.example", { appleAuthorizationCode: "c.1" }))).status).toBe(403);
    user = null;
    expect((await DELETE(del("neville://", { appleAuthorizationCode: "c.1" }))).status).toBe(401);
    expect(steps).toEqual([]);
  });
});
