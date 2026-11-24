import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// A real pool object that never connects: a Google request must be refused before any query runs.
vi.mock("@/lib/server/db", async () => {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: "postgres://nobody:nopass@127.0.0.1:1/none" });
  return { getPool: () => pool, withTx: async () => undefined };
});
vi.mock("@vercel/blob", () => ({ del: vi.fn(), get: vi.fn(), put: vi.fn() }));

const env = {
  ACCOUNTS_ENABLED: "true",
  DATABASE_URL: "postgres://x",
  BLOB_READ_WRITE_TOKEN: "blob",
  BETTER_AUTH_SECRET: "a-secret-of-some-length-0123456789abcdef",
};

describe("accounts with Apple only (no Google variables)", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const k of Object.keys(process.env)) if (/^(GOOGLE_|APPLE_)/.test(k)) delete process.env[k];
    Object.assign(process.env, env);
  });

  it("is off with no provider, and on for Google alone", async () => {
    const a = await import("@/lib/server/accounts");
    expect(a.accountsEnabled()).toBe(false);
    expect(a.signInProviders()).toEqual([]);
    process.env.GOOGLE_CLIENT_ID = "gid";
    process.env.GOOGLE_CLIENT_SECRET = "gsecret";
    expect(a.accountsEnabled()).toBe(true);
    expect(a.signInProviders()).toEqual(["google"]);
  });

  it("turns on with Apple alone, offers only Apple, and does not register Google", async () => {
    const pem = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    Object.assign(process.env, {
      APPLE_CLIENT_ID: "com.example.web",
      APPLE_TEAM_ID: "TEAM123456",
      APPLE_KEY_ID: "KEY1234567",
      APPLE_PRIVATE_KEY: pem,
    });
    const a = await import("@/lib/server/accounts");
    expect(a.accountsEnabled()).toBe(true);
    expect(a.signInProviders()).toEqual(["apple"]);
    expect(a.missingVars()).toEqual([]);

    // Google is not registered, so Better Auth's sign-in route answers PROVIDER_NOT_FOUND for it (a 404 with a fixed
    // message, before any secret is read). The route itself needs a live database, so this checks the registration.
    const ctx = await a.getAuth().$context;
    const names = (ctx.socialProviders as { id: string }[]).map((p) => p.id);
    expect(names).toEqual(["apple"]);
  });
});
