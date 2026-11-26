// The voice call must never be allowed to run past the paywall's deadline (#168). With the paywall on, its budget is
// the time left before the deadline minus a 2 s margin; below 3 s it is not started at all. The deadline is 9 s here.
import { PGlite } from "@electric-sql/pglite";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error plain .mjs script, no type declarations
import { runMigrations } from "../scripts/migrate-core.mjs";

vi.mock("server-only", () => ({}));
vi.mock("@/config/credits.json", async (orig) => {
  const real = (await orig<{ default: Record<string, unknown> }>()).default;
  return { default: { ...real, deadlineMs: 9000 } };
});

let pg: PGlite;
let writeDelayMs = 0;
let vetDelayMs = 0;
const synth = vi.fn();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

vi.mock("@/lib/server/db", () => ({
  dbConfigured: () => true,
  getPool: () => ({ query: (q: string, p?: unknown[]) => pg.query(q, p) }),
  withTx: async <T>(fn: (d: unknown) => Promise<T>) => pg.transaction((t) => fn({ query: (q: string, p?: unknown[]) => t.query(q, p) })),
}));
vi.mock("@/lib/server/accounts", () => ({
  accountsEnabled: () => true,
  currentUser: async () => ({ id: "alice", name: "Alice", email: "alice@x.test", image: null, emailVerified: true }),
}));
vi.mock("@/lib/server/openrouter", () => ({ apiKey: () => "k", OPENROUTER: "https://x" }));
vi.mock("@/lib/server/limits", () => ({
  LIMITS: { maxWantChars: 280, maxScriptChars: 700 },
  generationEnabled: () => true,
  takeSlot: async () => ({ refusal: null, release: async () => undefined }),
  underCeiling: async () => ({ ok: true, usage: 0 }),
}));
vi.mock("@/lib/server/writer", () => ({
  writeScript: async () => {
    if (writeDelayMs) await sleep(writeDelayMs);
    return { lines: ["It is done."], refrain: "r", source: "model", model: "m" };
  },
}));
vi.mock("@/lib/server/vet", () => ({
  vetScript: async () => {
    if (vetDelayMs) await sleep(vetDelayMs);
    return { ok: true, model: "m", costUsd: 0 };
  },
}));
vi.mock("@/lib/server/tts", () => ({ synthesize: (o: unknown) => synth(o) }));
vi.mock("@/lib/server/ledger", () => ({ record: async () => undefined, estimateSpeech: async () => 0 }));

const manifest = async () =>
  (await import("@/app/api/manifest/route")).POST(
    new Request("https://getneville.vercel.app/api/manifest", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "1.2.3.4" },
      body: JSON.stringify({ want: "I am calm" }),
    }),
  );
const rerecord = async () =>
  (await import("@/app/api/rerecord/route")).POST(
    new Request("https://getneville.vercel.app/api/rerecord", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "1.2.3.4" },
      body: JSON.stringify({ lines: ["It is done."] }),
    }),
  );
const balance = async () => Number((await pg.query<{ b: number }>(`select coalesce(sum(delta),0)::int as b from credit_ledger where user_id = 'alice'`)).rows[0].b);
const budgetGiven = () => (synth.mock.calls[0]?.[0] as { timeoutMs: number }).timeoutMs;

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("PAYWALL_ENABLED", "true");
  vi.stubEnv("UNLIMITED_USER_EMAILS", "");
  vi.stubEnv("UNLIMITED_USER_IDS", "");
  pg = new PGlite();
  await runMigrations(
    { query: async (t: string, p?: unknown[]) => (p ? pg.query(t, p) : ((await pg.exec(t)).at(-1) ?? { rows: [] })) },
    path.join(process.cwd(), "db", "migrations"),
    () => undefined,
  );
  await pg.query(`insert into "user" (id, name, email, "emailVerified") values ('alice', 'Alice', 'alice@x.test', true)`);
  writeDelayMs = 0;
  vetDelayMs = 0;
  synth.mockReset();
  synth.mockResolvedValue({ ok: true, audio: new Uint8Array([1]), mime: "audio/wav", sentChars: 1, speedApplied: true, pauseMs: 0 });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await pg.close();
});

describe.each([
  ["/api/manifest", manifest],
  ["/api/rerecord", rerecord],
])("%s voice budget", (name, call) => {
  const slowFirstStep = (ms: number) => {
    if (name === "/api/manifest") writeDelayMs = ms;
    else vetDelayMs = ms;
  };

  it("with the paywall on, never lets the voice call run past the deadline minus a 2 s margin", async () => {
    expect((await call()).status).toBe(200);
    expect(synth).toHaveBeenCalledTimes(1);
    const ms = budgetGiven();
    expect(ms).toBeLessThanOrEqual(7000); // 9 s deadline - 2 s margin
    expect(ms).toBeGreaterThanOrEqual(3000);
  });
  it("takes the time already used by the script or check off the voice budget", async () => {
    slowFirstStep(2500);
    expect((await call()).status).toBe(200);
    expect(budgetGiven()).toBeLessThanOrEqual(4500); // 9 s - 2.5 s - 2 s margin
    expect(budgetGiven()).toBeGreaterThanOrEqual(3000);
  });
  it("does not start the voice when under 3 s would be left, and returns the credit", async () => {
    slowFirstStep(5000); // 9 s - 5 s - 2 s margin = 2 s
    const res = await call();
    expect(res.status).toBe(504);
    expect(await res.json()).toMatchObject({ code: "timeout", creditReturned: true });
    expect(synth).not.toHaveBeenCalled();
    expect(await balance()).toBe(1); // the free credit was spent, then returned
  }, 20_000);
  it("with the paywall off, leaves the voice budget exactly as it was", async () => {
    vi.stubEnv("PAYWALL_ENABLED", "");
    expect((await call()).status).toBe(200);
    expect(budgetGiven()).toBeGreaterThan(40_000);
    expect(budgetGiven()).toBeLessThanOrEqual(42_000);
  });
});
