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
const synth = vi.fn();

vi.mock("@/lib/server/db", () => ({
  dbConfigured: () => true,
  getPool: () => ({ query: (q: string, p?: unknown[]) => pg.query(q, p) }),
  withTx: <T>(fn: (d: unknown) => Promise<T>) => pg.transaction((t) => fn({ query: (q: string, p?: unknown[]) => t.query(q, p) })),
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
vi.mock("@/lib/server/writer", () => ({ writeScript: async () => ({ lines: ["It is done."], refrain: "r", source: "model", model: "m" }) }));
vi.mock("@/lib/server/vet", () => ({ vetScript: async () => ({ ok: true, model: "m", costUsd: 0 }) }));
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
  it("is not applied when the paywall is off", async () => {
    vi.stubEnv("PAYWALL_ENABLED", "");
    hang = false;
    expect((await call()).status).toBe(200);
  });
  it("a request that finishes in time is unaffected and its spend is marked fulfilled", async () => {
    hang = false;
    expect((await call()).status).toBe(200);
    expect((await pg.query(`select fulfilled_at is not null as done from credit_ledger where reason = 'spend'`)).rows).toEqual([{ done: true }]);
  });
});
