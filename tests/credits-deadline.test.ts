// The deadline guard on the paid routes (#168): a request that has not finished before the platform kills it
// (maxDuration 60) returns a clear error and its credit is refunded. The deadline is cut to 150 ms here.
import { PGlite } from "@electric-sql/pglite";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error plain .mjs script, no type declarations
import { runMigrations } from "../scripts/migrate-core.mjs";

vi.mock("server-only", () => ({}));
vi.mock("@/config/credits.json", async (orig) => {
  const real = (await orig<{ default: Record<string, unknown> }>()).default;
  return { default: { ...real, deadlineMs: 150 } };
});

let pg: PGlite;
let hang = false;
let late: (() => void) | null = null;
let refundFailures = 0;
let slowTxMs = 0;
let writeDelayMs = 0;
let vetDelayMs = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const synth = vi.fn();

vi.mock("@/lib/server/db", () => ({
  dbConfigured: () => true,
  getPool: () => ({
    query: (q: string, p?: unknown[]) => {
      if (refundFailures > 0 && q.includes("'refund'")) {
        refundFailures--;
        return Promise.reject(new Error("database blip"));
      }
      return pg.query(q, p);
    },
  }),
  withTx: async <T>(fn: (d: unknown) => Promise<T>) => {
    if (slowTxMs) await sleep(slowTxMs);
    return pg.transaction((t) => fn({ query: (q: string, p?: unknown[]) => t.query(q, p) }));
  },
}));
vi.mock("@/lib/server/accounts", () => ({
  accountsEnabled: () => true,
  currentUser: async () => ({ id: "alice", name: "Alice", email: "alice@x.test", image: null, emailVerified: true }),
}));
vi.mock("@/lib/server/openrouter", () => ({ apiKey: () => "k", OPENROUTER: "https://x" }));
vi.mock("@/lib/server/limits", () => ({
  LIMITS: { maxWantChars: 280 },
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
  hang = true;
  late = null;
  refundFailures = 0;
  slowTxMs = 0;
  writeDelayMs = 0;
  vetDelayMs = 0;
  synth.mockReset();
  synth.mockImplementation(
    () =>
      new Promise((resolve) => {
        late = () => resolve({ ok: true, audio: new Uint8Array([1]), mime: "audio/wav", sentChars: 1, speedApplied: true, pauseMs: 0 });
        if (!hang) late();
      }),
  );
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await pg.close();
});

describe.each([
  ["/api/manifest", manifest],
  ["/api/rerecord", rerecord],
])("%s when the work does not finish in time", (_name, call) => {
  it("answers 504 timeout and returns the credit", async () => {
    const res = await call();
    expect(res.status).toBe(504);
    expect(await res.json()).toMatchObject({ code: "timeout", creditReturned: true });
    expect(await balance()).toBe(1); // the free credit was spent, then refunded
    const rows = (await pg.query<{ reason: string }>(`select reason from credit_ledger order by id`)).rows.map((r) => r.reason);
    expect(rows).toEqual(["free", "spend", "refund"]);
  });
  it("does not refund twice when the slow work finishes after the deadline", async () => {
    await call();
    late?.();
    await new Promise((r) => setTimeout(r, 50));
    expect(await balance()).toBe(1);
  });
  it("does not mark a timed-out spend as fulfilled when the slow work finishes late", async () => {
    await call();
    late?.();
    await sleep(50);
    expect((await pg.query(`select fulfilled_at is null as open from credit_ledger where reason = 'spend'`)).rows).toEqual([{ open: true }]);
  });
  it("says the credit was not returned when the refund itself fails, and logs the spend id", async () => {
    refundFailures = 99;
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await call();
    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body).toMatchObject({ code: "timeout", creditReturned: false });
    expect(body.error).not.toMatch(/returned/i);
    expect(await balance()).toBe(0);
    expect(err.mock.calls.some((c) => String(c[0]).includes("[credits] refund failed") && /spendId/.test(String(c[1])))).toBe(true);
  });
  it("makes no claim either way when the deadline passes while the credit is still being taken, and the credit still comes back", async () => {
    slowTxMs = 400;
    const res = await call();
    expect(res.status).toBe(504);
    expect(await res.json()).not.toHaveProperty("creditReturned");
    await sleep(900);
    expect(await balance()).toBe(1);
  });
  it("is not applied when the paywall is off", async () => {
    vi.stubEnv("PAYWALL_ENABLED", "");
    hang = false;
    expect((await call()).status).toBe(200);
  });
  it("starts no paid call after the deadline has passed", async () => {
    hang = false;
    if (_name === "/api/manifest") writeDelayMs = 400;
    else vetDelayMs = 400;
    const res = await call();
    expect(res.status).toBe(504);
    await sleep(700);
    expect(synth).not.toHaveBeenCalled();
    expect(await balance()).toBe(1);
  });
  it("a request that finishes in time is unaffected and its spend is marked fulfilled", async () => {
    hang = false;
    expect((await call()).status).toBe(200);
    expect((await pg.query(`select fulfilled_at is not null as done from credit_ledger where reason = 'spend'`)).rows).toEqual([{ done: true }]);
  });
});
