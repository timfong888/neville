// DELETE /api/account: Apple tokens are gathered before the rows go and recorded in the deleting
// transaction; Apple is called only after it commits; a failure never stops the deletion (#98).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const steps: string[] = [];
let user: { id: string } | null;
let deleteFails = false;
let recordFails = false;
let direct: () => Promise<boolean>;
let found: () => Promise<{ tokens: unknown[]; unreachable: boolean }>;
let links: unknown[];
let left: () => Promise<number>;

vi.mock("@/lib/server/accounts", () => ({
  PRIMARY_ORIGIN: "https://getneville.vercel.app",
  LEGACY_ORIGINS: [],
  accountsEnabled: () => true,
  missingVars: () => [],
  signInProviders: () => ["apple"],
  currentUser: async () => user,
  appleClients: () => ({ web: null, app: null }),
  appleLinks: async () => (steps.push("links"), links),
  withTx: async (fn: (db: unknown) => Promise<unknown>) => fn({}),
  purgeAudio: async () => (steps.push("purge"), 0),
}));
vi.mock("@/lib/server/db", () => ({ getPool: () => ({}) }));
vi.mock("@/lib/server/libraryDb", () => ({
  deleteAccount: async () => {
    steps.push("delete");
    if (deleteFails) throw new Error("database down");
    return ["audio/k"];
  },
  addTombstones: async () => undefined,
}));
vi.mock("@/lib/server/appleRevoke", async (orig) => ({
  ...(await orig<typeof import("@/lib/server/appleRevoke")>()),
  collectAppleTokens: (o: { code?: string }) => (steps.push(`collect:${o.code ?? "-"}`), found()),
  revokeStoredToken: () => (steps.push("direct"), direct()),
}));
vi.mock("@/lib/server/appleRevokeDb", () => ({
  tryAddPendingRevocations: async (_db: unknown, tokens: unknown[]) => (steps.push(`record:${tokens.length}`), recordFails ? null : tokens.map((_, i) => String(i + 1))),
  settleAppleRevocations: async (_db: unknown, _c: unknown, mine: string[]) => (steps.push(`settle:${mine.length}`), left()),
}));

const del = (origin: string | null, body?: unknown) =>
  new Request("https://getneville.vercel.app/api/account", {
    method: "DELETE",
    headers: { ...(origin ? { origin } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
const run = async (body?: unknown) => (await (await import("@/app/api/account/route")).DELETE(del("neville://", body))).json();

beforeEach(() => {
  steps.length = 0;
  user = { id: "u1" };
  deleteFails = false;
  recordFails = false;
  direct = async () => true;
  links = [{ accountId: "apple-user-1", refreshToken: null, accessToken: null }];
  found = async () => ({ tokens: [{ clientId: "pckg.neville", token: "rt", hint: "refresh_token" }], unreachable: false });
  left = async () => 0;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("DELETE /api/account with Sign in with Apple revocation", () => {
  it("gathers tokens with the app's code, records them with the delete, then calls Apple", async () => {
    expect(await run({ appleAuthorizationCode: "c.1" })).toEqual({ ok: true, audioPending: 0, apple: "revoked" });
    expect(steps).toEqual(["links", "collect:c.1", "delete", "record:1", "settle:1", "purge"]);
  });

  it("still deletes and says failed when Apple refuses: the token stays recorded for a retry", async () => {
    left = async () => 1;
    expect(await run()).toMatchObject({ ok: true, apple: "failed" });
    left = async () => {
      throw new Error("database blip");
    };
    expect(await run()).toMatchObject({ ok: true, apple: "failed" });
    expect(steps.filter((s) => s === "delete")).toHaveLength(2);
  });

  it("says failed for a grant nothing can reach, and when the Apple sign-ins cannot be read", async () => {
    found = async () => ({ tokens: [], unreachable: true });
    expect(await run()).toMatchObject({ ok: true, apple: "failed" });
    found = async () => {
      throw new Error("boom");
    };
    expect(await run()).toMatchObject({ ok: true, apple: "failed" });
    expect(steps.filter((s) => s === "delete")).toHaveLength(2);
  });

  it("says nothing-to-revoke for an account with no Apple sign-in, and still retries older rows", async () => {
    links = [];
    found = async () => ({ tokens: [], unreachable: false });
    expect(await run()).toMatchObject({ ok: true, apple: "nothing-to-revoke" });
    expect(steps).toContain("settle:0");
  });

  it("still deletes when the retry table cannot be written, and tries Apple once without it", async () => {
    recordFails = true;
    expect(await run({ appleAuthorizationCode: "c.1" })).toEqual({ ok: true, audioPending: 0, apple: "revoked" });
    expect(steps).toEqual(["links", "collect:c.1", "delete", "record:1", "direct", "purge"]);
    direct = async () => false;
    expect(await run()).toMatchObject({ ok: true, apple: "failed" });
    expect(console.error).toHaveBeenCalledWith("Account deletion: Apple revocations could not be recorded for retry.");
  });

  it("neither records nor calls Apple when the deletion fails", async () => {
    deleteFails = true;
    await expect(run({ appleAuthorizationCode: "c.1" })).rejects.toThrow("database down");
    expect(steps).toEqual(["links", "collect:c.1", "delete"]);
  });

  it("refuses a foreign origin or a signed-out request before touching Apple or the database", async () => {
    const { DELETE } = await import("@/app/api/account/route");
    expect((await DELETE(del("https://evil.example", { appleAuthorizationCode: "c.1" }))).status).toBe(403);
    user = null;
    expect((await DELETE(del("neville://", { appleAuthorizationCode: "c.1" }))).status).toBe(401);
    expect(steps).toEqual([]);
  });
});
