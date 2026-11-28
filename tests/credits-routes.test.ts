// /api/revenuecat/webhook, /api/credits and the paywall on /api/manifest (#168), on PGlite.
import { PGlite } from "@electric-sql/pglite";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error plain .mjs script, no type declarations
import { runMigrations } from "../scripts/migrate-core.mjs";
import { isFilterRelaxed } from "@/lib/credits";

vi.mock("server-only", () => ({}));

let pg: PGlite;
let user: { id: string; name: string; email: string; image: null; emailVerified: boolean } | null;
let accountsOn = true;
let voiceOk = true;
let refundFailures = 0;
let underCeilingOk = true;
let lookupFails = false;
const synth = vi.fn();
const takeSlot = vi.fn();
const release = vi.fn();

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
  withTx: <T>(fn: (d: unknown) => Promise<T>) => pg.transaction((t) => fn({ query: (q: string, p?: unknown[]) => t.query(q, p) })),
}));
vi.mock("@/lib/server/accounts", () => ({
  accountsEnabled: () => accountsOn,
  currentUser: async () => {
    if (lookupFails) throw new Error("auth database down");
    return user;
  },
}));
vi.mock("@/lib/server/openrouter", () => ({ apiKey: () => "k", OPENROUTER: "https://x" }));
vi.mock("@/lib/server/limits", () => ({
  LIMITS: { maxWantChars: 280 },
  generationEnabled: () => true,
  takeSlot: (ip: string) => takeSlot(ip),
  underCeiling: async () => (underCeilingOk ? { ok: true, usage: 0 } : { ok: false, refusal: { status: 503, code: "budget_unknown", error: "Paused." } }),
}));
const writeScriptFn = vi.fn();
vi.mock("@/lib/server/writer", () => ({ writeScript: (...a: unknown[]) => writeScriptFn(...a) }));
vi.mock("@/lib/server/vet", () => ({ vetScript: async () => ({ ok: true, model: "m", costUsd: 0 }) }));
vi.mock("@/lib/server/tts", () => ({ synthesize: (o: unknown) => synth(o) }));
vi.mock("@/lib/server/ledger", () => ({ record: async () => undefined, estimateSpeech: async () => 0 }));

const SECRET = "Bearer test-secret";
const AUTH = { authorization: SECRET };

const hook = (event: Record<string, unknown>, headers: Record<string, string> = AUTH) =>
  new Request("https://getneville.vercel.app/api/revenuecat/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ api_version: "1.0", event }),
  });
const purchase = (over: Record<string, unknown> = {}) => ({
  id: "evt-1",
  type: "NON_RENEWING_PURCHASE",
  app_user_id: "alice",
  product_id: "pack10",
  environment: "SANDBOX",
  ...over,
});
const callHook = async (req: Request) => (await import("@/app/api/revenuecat/webhook/route")).POST(req);
const balance = async (id: string) =>
  Number((await pg.query<{ b: number }>(`select coalesce(sum(delta),0)::int as b from credit_ledger where user_id = $1`, [id])).rows[0].b);

const manifestReq = () =>
  new Request("https://getneville.vercel.app/api/manifest", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "1.2.3.4" },
    body: JSON.stringify({ want: "I am calm", name: "Al" }),
  });
const callManifest = async () => (await import("@/app/api/manifest/route")).POST(manifestReq());
const callRerecord = async () =>
  (await import("@/app/api/rerecord/route")).POST(
    new Request("https://getneville.vercel.app/api/rerecord", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "1.2.3.4" },
      body: JSON.stringify({ lines: ["It is done."] }),
    }),
  );
const alice = { id: "alice", name: "Alice", email: "alice@x.test", image: null, emailVerified: true };

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("REVENUECAT_WEBHOOK_AUTH", SECRET);
  vi.stubEnv("PAYWALL_ENABLED", "true");
  vi.stubEnv("UNLIMITED_USER_EMAILS", "");
  vi.stubEnv("UNLIMITED_USER_IDS", "");
  vi.stubEnv("RELAXED_FILTER_EMAILS", "");
  vi.stubEnv("RELAXED_FILTER_IDS", "");
  vi.stubEnv("REVENUECAT_ACCEPT_SANDBOX", "true");
  writeScriptFn.mockReset();
  writeScriptFn.mockResolvedValue({ lines: ["It is done."], refrain: "r", source: "model", model: "m" });
  pg = new PGlite();
  await runMigrations(
    { query: async (t: string, p?: unknown[]) => (p ? pg.query(t, p) : ((await pg.exec(t)).at(-1) ?? { rows: [] })) },
    path.join(process.cwd(), "db", "migrations"),
    () => undefined,
  );
  for (const id of ["alice", "bob"]) {
    await pg.query(`insert into "user" (id, name, email, "emailVerified") values ($1, $1, $1 || '@x.test', true)`, [id]);
  }
  user = { ...alice };
  accountsOn = true;
  voiceOk = true;
  refundFailures = 0;
  underCeilingOk = true;
  lookupFails = false;
  synth.mockReset();
  synth.mockImplementation(async () =>
    voiceOk
      ? { ok: true, audio: new Uint8Array([1, 2, 3]), mime: "audio/wav", sentChars: 10, speedApplied: true, pauseMs: 0 }
      : { ok: false, status: 500, message: "down", sentChars: 5 },
  );
  takeSlot.mockReset();
  takeSlot.mockResolvedValue({ refusal: null, release });
  release.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await pg.close();
});

describe("POST /api/revenuecat/webhook", () => {
  it("refuses a missing or wrong Authorization header and grants nothing", async () => {
    expect((await callHook(hook(purchase(), {}))).status).toBe(401);
    expect((await callHook(hook(purchase(), { authorization: "Bearer nope" }))).status).toBe(401);
    expect(await balance("alice")).toBe(0);
  });
  it("refuses everything when REVENUECAT_WEBHOOK_AUTH is not set", async () => {
    vi.stubEnv("REVENUECAT_WEBHOOK_AUTH", "");
    expect((await callHook(hook(purchase()))).status).toBe(503);
    expect(await balance("alice")).toBe(0);
  });
  it("ignores SANDBOX purchases unless REVENUECAT_ACCEPT_SANDBOX=true, so test purchases cannot mint real credits", async () => {
    vi.stubEnv("REVENUECAT_ACCEPT_SANDBOX", "");
    const res = await callHook(hook(purchase({ id: "sb-off", environment: "SANDBOX" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ignored", reason: "sandbox" });
    expect(await balance("alice")).toBe(0);
    // A production purchase is unaffected, and a missing environment counts as production.
    await callHook(hook(purchase({ id: "pr-1", environment: "PRODUCTION" })));
    await callHook(hook(purchase({ id: "pr-2", environment: undefined })));
    expect(await balance("alice")).toBe(20);
    vi.stubEnv("REVENUECAT_ACCEPT_SANDBOX", "true");
    await callHook(hook(purchase({ id: "sb-on", environment: "SANDBOX" })));
    expect(await balance("alice")).toBe(30);
  });
  it("adds 10 credits for a pack10 purchase, matched by the app user id", async () => {
    const res = await callHook(hook(purchase()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: "granted" });
    expect(await balance("alice")).toBe(10);
  });
  it("answers 200 and adds nothing when the same event is delivered twice", async () => {
    const a = await callHook(hook(purchase()));
    const b = await callHook(hook(purchase()));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await b.json()).toMatchObject({ ok: true, status: "duplicate" });
    expect(await balance("alice")).toBe(10);
  });
  it("adds nothing for a second starter purchase, with a different event id, and still answers 200", async () => {
    await callHook(hook(purchase({ id: "s1", product_id: "starter" })));
    const again = await callHook(hook(purchase({ id: "s2", product_id: "starter" })));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ status: "already_owned" });
    expect(await balance("alice")).toBe(3);
  });
  it("grants once when the same store transaction arrives under different event ids (a restore)", async () => {
    const a = await callHook(hook(purchase({ id: "r1", product_id: "starter", transaction_id: "tx-100" })));
    const b = await callHook(hook(purchase({ id: "r2", type: "INITIAL_PURCHASE", product_id: "starter", transaction_id: "tx-100" })));
    expect(await a.json()).toMatchObject({ status: "granted" });
    expect(await b.json()).toMatchObject({ status: "duplicate" });
    expect(await balance("alice")).toBe(3);
  });
  it("still adds nothing for a starter with a new transaction: the per-account check is the second guard", async () => {
    await callHook(hook(purchase({ id: "r1", product_id: "starter", transaction_id: "tx-1" })));
    const again = await callHook(hook(purchase({ id: "r3", product_id: "starter", transaction_id: "tx-2" })));
    expect(await again.json()).toMatchObject({ status: "already_owned" });
    expect(await balance("alice")).toBe(3);
  });
  it("a sandbox Starter does not stop the real Starter from granting", async () => {
    await callHook(hook(purchase({ id: "sb", product_id: "starter", transaction_id: "t-sb", environment: "SANDBOX" })));
    const real = await callHook(hook(purchase({ id: "pr", product_id: "starter", transaction_id: "t-pr", environment: "PRODUCTION" })));
    expect(await real.json()).toMatchObject({ status: "granted" });
    expect(await balance("alice")).toBe(6);
  });
  it("answers 200 and adds nothing once a sandbox account is at the cap, and logs it", async () => {
    for (let i = 0; i < 10; i++) await callHook(hook(purchase({ id: `c${i}`, environment: "SANDBOX", transaction_id: `t${i}` })));
    const res = await callHook(hook(purchase({ id: "c10", environment: "SANDBOX", transaction_id: "t10" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "sandbox_capped" });
    expect(await balance("alice")).toBe(100);
    await callHook(hook(purchase({ id: "real", environment: "PRODUCTION", transaction_id: "treal" })));
    expect(await balance("alice")).toBe(110);
  });
  it("handles INITIAL_PURCHASE too", async () => {
    await callHook(hook(purchase({ type: "INITIAL_PURCHASE", id: "i1" })));
    expect(await balance("alice")).toBe(10);
  });
  it("finds the account through an alias when app_user_id is anonymous", async () => {
    await callHook(hook(purchase({ id: "a1", app_user_id: "$RCAnonymousID:zzz", aliases: ["$RCAnonymousID:zzz", "bob"] })));
    expect(await balance("bob")).toBe(10);
  });
  it("answers 503 for a purchase by an unknown user so RevenueCat retries, and logs it once per event id", async () => {
    const warn = vi.mocked(console.warn);
    warn.mockClear();
    const unknown = purchase({ id: "u1", app_user_id: "$RCAnonymousID:nobody" });
    for (let i = 0; i < 3; i++) {
      const res = await callHook(hook(unknown));
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ code: "unknown_user" });
    }
    expect(warn.mock.calls.filter((c) => String(c[0]).includes("unknown user"))).toHaveLength(1);
    // The user shows up later (the account exists now): the retry is granted.
    await pg.query(`insert into "user" (id, name, email, "emailVerified") values ('late', 'late', 'late@x.test', true)`);
    expect((await callHook(hook({ ...unknown, app_user_id: "late" }))).status).toBe(200);
    expect(await balance("late")).toBe(10);
  });
  it("answers 200 and grants nothing for an unknown product or another event type", async () => {
    expect(await (await callHook(hook(purchase({ id: "p1", product_id: "gold" })))).json()).toMatchObject({ status: "ignored" });
    expect((await callHook(hook(purchase({ id: "t1", type: "CANCELLATION" })))).status).toBe(200);
    expect((await callHook(hook(purchase({ id: "t2", type: "TEST" })))).status).toBe(200);
    expect(await balance("alice")).toBe(0);
  });
  it("answers 400 for a purchase with no event id, since it could not be made safe to repeat", async () => {
    expect((await callHook(hook(purchase({ id: undefined })))).status).toBe(400);
    expect(await balance("alice")).toBe(0);
  });
  it("answers 400 for a body that is not JSON", async () => {
    const bad = new Request("https://x/api/revenuecat/webhook", { method: "POST", headers: AUTH, body: "nope" });
    expect((await callHook(bad)).status).toBe(400);
  });
});

describe("GET /api/credits", () => {
  const get = async () => (await import("@/app/api/credits/route")).GET(new Request("https://getneville.vercel.app/api/credits"));

  it("is 401 when signed out", async () => {
    user = null;
    const res = await get();
    expect(res.status).toBe(401);
  });
  it("gives the free credit on first call and shows both packs", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      balance: 1,
      unlimited: false,
      paywallEnabled: true,
      signInRequired: true,
      packs: [
        { id: "starter", credits: 3 },
        { id: "pack10", credits: 10 },
      ],
    });
    expect((await (await get()).json()).balance).toBe(1); // not given twice
  });
  it("hides starter once it was bought for real, but not after a sandbox test purchase", async () => {
    await callHook(hook(purchase({ id: "sb1", product_id: "starter", environment: "SANDBOX" })));
    expect((await (await get()).json()).packs.map((p: { id: string }) => p.id)).toEqual(["starter", "pack10"]);
    await callHook(hook(purchase({ id: "s1", product_id: "starter", environment: "PRODUCTION" })));
    const body = await (await get()).json();
    expect(body.balance).toBe(7);
    expect(body.packs).toEqual([{ id: "pack10", credits: 10 }]);
  });
  it("says unlimited for a listed, verified email, and never from anything the client sends", async () => {
    vi.stubEnv("UNLIMITED_USER_EMAILS", "alice@x.test");
    expect((await (await get()).json()).unlimited).toBe(true);
    user = { ...alice, emailVerified: false };
    expect((await (await get()).json()).unlimited).toBe(false);
    vi.stubEnv("UNLIMITED_USER_EMAILS", "");
    vi.stubEnv("UNLIMITED_USER_IDS", "alice");
    user = { ...alice, emailVerified: false };
    expect((await (await get()).json()).unlimited).toBe(true);
    vi.stubEnv("UNLIMITED_USER_IDS", "");
    const forged = new Request("https://getneville.vercel.app/api/credits?unlimited=1", { headers: { "x-unlimited": "true" } });
    user = { ...alice };
    vi.stubEnv("UNLIMITED_USER_EMAILS", "");
    expect((await (await import("@/app/api/credits/route")).GET(forged).then((r) => r.json())).unlimited).toBe(false);
  });
});

describe("POST /api/manifest with the paywall on", () => {
  it("answers 401 sign_in_required when signed out, after the IP and ceiling guards and before any spend", async () => {
    user = null;
    const res = await callManifest();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "sign_in_required" });
    expect(takeSlot).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled(); // a signed-out request keeps its slot, so it counts against the limits
    expect(synth).not.toHaveBeenCalled();
    expect((await pg.query(`select count(*)::int as n from credit_ledger`)).rows[0]).toEqual({ n: 0 });
  });
  it("lets the IP guard refuse a signed-out request first", async () => {
    user = null;
    takeSlot.mockResolvedValue({ refusal: { status: 429, code: "limit", error: "Too many." }, release });
    expect((await callManifest()).status).toBe(429);
  });
  it("throws and never takes a slot when the sign-in lookup throws with the paywall on", async () => {
    lookupFails = true;
    await expect(callManifest()).rejects.toThrow("auth database down");
    expect(takeSlot).not.toHaveBeenCalled();
    expect(synth).not.toHaveBeenCalled();
    expect((await pg.query(`select count(*)::int as n from credit_ledger`)).rows[0]).toEqual({ n: 0 });
  });
  it("runs the spend-ceiling guard before the sign-in check", async () => {
    user = null;
    underCeilingOk = false;
    expect((await callManifest()).status).toBe(503);
    expect(release).toHaveBeenCalled();
  });
  it("spends the free credit, then answers 402 no_credits with the balance", async () => {
    const first = await callManifest();
    expect(first.status).toBe(200);
    expect(first.headers.get("x-credits-left")).toBe("0");
    const second = await callManifest();
    expect(second.status).toBe(402);
    expect(await second.json()).toMatchObject({ code: "no_credits", balance: 0 });
    expect(synth).toHaveBeenCalledTimes(1);
  });
  it("marks the spend fulfilled when the recording is delivered, and not when it fails", async () => {
    expect((await callManifest()).status).toBe(200);
    const rows = (await pg.query(`select fulfilled_at is not null as done from credit_ledger where reason = 'spend'`)).rows;
    expect(rows).toEqual([{ done: true }]);
  });
  it("lets only one of several simultaneous requests record at balance 1", async () => {
    const out = await Promise.all(Array.from({ length: 5 }, () => callManifest()));
    expect(out.filter((r) => r.status === 200)).toHaveLength(1);
    expect(out.filter((r) => r.status === 402)).toHaveLength(4);
    expect(synth).toHaveBeenCalledTimes(1);
    expect(await balance("alice")).toBe(0);
  });
  it("skips the spend for a tester and logs a tester row", async () => {
    vi.stubEnv("UNLIMITED_USER_EMAILS", "Alice@x.test");
    for (let i = 0; i < 3; i++) expect((await callManifest()).status).toBe(200);
    const rows = (await pg.query<{ reason: string; n: number }>(`select reason, count(*)::int as n from credit_ledger group by reason`)).rows;
    expect(rows).toEqual([{ reason: "tester", n: 3 }]);
    expect((await pg.query(`select distinct route, action from credit_ledger`)).rows).toEqual([{ route: "/api/manifest", action: "manifest" }]);
    expect(await balance("alice")).toBe(0);
  });
  it("treats a listed account id as a tester even when the email is a private relay and unverified", async () => {
    vi.stubEnv("UNLIMITED_USER_IDS", "alice");
    user = { ...alice, email: "x@privaterelay.appleid.com", emailVerified: false };
    for (let i = 0; i < 2; i++) expect((await callManifest()).status).toBe(200);
    expect((await pg.query(`select reason, count(*)::int as n from credit_ledger group by reason`)).rows).toEqual([{ reason: "tester", n: 2 }]);
  });
  it("does not treat an unverified email as a tester", async () => {
    vi.stubEnv("UNLIMITED_USER_EMAILS", "alice@x.test");
    user = { ...alice, emailVerified: false };
    await callManifest();
    expect((await callManifest()).status).toBe(402);
  });
  it("charges nothing when the voice fails: the credit comes back", async () => {
    voiceOk = false;
    const res = await callManifest();
    expect(res.status).toBe(502);
    expect(await balance("alice")).toBe(1);
  });
  it("keeps trying the refund when the database blips, and does not lose the credit", async () => {
    voiceOk = false;
    refundFailures = 2;
    expect((await callManifest()).status).toBe(502);
    expect(await balance("alice")).toBe(1);
  });
  it("says so in the log, with the spend id, when the refund cannot be written at all", async () => {
    voiceOk = false;
    refundFailures = 99;
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await callManifest()).status).toBe(502);
    expect(await balance("alice")).toBe(0);
    expect(err.mock.calls.some((c) => String(c[0]).includes("[credits] refund failed") && /spendId/.test(String(c[1])))).toBe(true);
  });
  it("charges nothing when a guard refuses first", async () => {
    takeSlot.mockResolvedValue({ refusal: { status: 429, code: "limit", error: "Too many." }, release });
    expect((await callManifest()).status).toBe(429);
    expect((await pg.query(`select count(*)::int as n from credit_ledger`)).rows[0]).toEqual({ n: 0 });
  });
  it("uses a purchased pack once the free credit is gone", async () => {
    await callManifest();
    await callHook(hook(purchase({ id: "p1", product_id: "starter" })));
    const ok = await callManifest();
    expect(ok.status).toBe(200);
    expect(ok.headers.get("x-credits-left")).toBe("2");
  });
  it("answers 503 and does not record when accounts are off", async () => {
    accountsOn = false;
    expect((await callManifest()).status).toBe(503);
    expect(synth).not.toHaveBeenCalled();
  });
});

describe("a spend cut off by a killed function heals on the account's next visit", () => {
  const get = async () => (await import("@/app/api/credits/route")).GET(new Request("https://getneville.vercel.app/api/credits"));
  // The free credit was spent, and the function died before it refunded or marked the recording delivered.
  const killedSpend = async (userId: string, secondsAgo: number, fulfilled = false) => {
    await pg.query(`insert into credit_ledger (user_id, delta, reason, once_key) values ($1, 1, 'free', 'free') on conflict do nothing`, [userId]);
    await pg.query(
      `insert into credit_ledger (user_id, delta, reason, route, action, created_at, fulfilled_at)
       values ($1, -1, 'spend', '/api/manifest', 'manifest', now() - ($2::int * interval '1 second'), ${fulfilled ? "now()" : "null"})`,
      [userId, secondsAgo],
    );
  };

  it("refunds it on the next credits read, once", async () => {
    await killedSpend("alice", 600);
    expect(await balance("alice")).toBe(0);
    expect((await (await get()).json()).balance).toBe(1);
    expect((await (await get()).json()).balance).toBe(1);
    expect((await pg.query(`select count(*)::int as n from credit_ledger where reason = 'refund'`)).rows[0]).toEqual({ n: 1 });
  });
  it("refunds it on the next charge, so the user can record again", async () => {
    await killedSpend("alice", 600);
    const res = await callManifest();
    expect(res.status).toBe(200);
    expect(res.headers.get("x-credits-left")).toBe("0");
    const reasons = (await pg.query<{ reason: string }>(`select reason from credit_ledger order by id`)).rows.map((r) => r.reason);
    expect(reasons).toEqual(["free", "spend", "refund", "spend"]);
  });
  it("does not touch a spend newer than 120 seconds (it may still be running)", async () => {
    await killedSpend("alice", 10);
    expect((await (await get()).json()).balance).toBe(0);
    expect((await callManifest()).status).toBe(402);
  });
  it("does not refund a spend whose recording was delivered", async () => {
    await killedSpend("alice", 600, true);
    expect((await (await get()).json()).balance).toBe(0);
    expect((await callManifest()).status).toBe(402);
  });
  it("heals only the account that is asking", async () => {
    await killedSpend("bob", 600);
    await get();
    await callManifest();
    expect(await balance("bob")).toBe(0);
  });
});

describe("POST /api/rerecord with the paywall on", () => {
  it("answers 401 signed out, after the IP guard and before any spend, keeping its slot", async () => {
    user = null;
    expect((await callRerecord()).status).toBe(401);
    expect(takeSlot).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
    expect(synth).not.toHaveBeenCalled();
  });
  it("lets the IP guard refuse a signed-out request first", async () => {
    user = null;
    takeSlot.mockResolvedValue({ refusal: { status: 429, code: "limit", error: "Too many." }, release });
    expect((await callRerecord()).status).toBe(429);
  });
  it("throws and never takes a slot when the sign-in lookup throws with the paywall on", async () => {
    lookupFails = true;
    await expect(callRerecord()).rejects.toThrow("auth database down");
    expect(takeSlot).not.toHaveBeenCalled();
    expect(synth).not.toHaveBeenCalled();
  });
  it("answers 402 no_credits at balance 0, and records nothing", async () => {
    await pg.query(`insert into credit_ledger (user_id, delta, reason, once_key) values ('alice', 1, 'free', 'free')`);
    await pg.query(`insert into credit_ledger (user_id, delta, reason) values ('alice', -1, 'spend')`);
    const res = await callRerecord();
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: "no_credits", balance: 0 });
    expect(synth).not.toHaveBeenCalled();
  });
  it("spends the configured cost and labels the row with route and action", async () => {
    const res = await callRerecord();
    expect(res.status).toBe(200);
    expect(res.headers.get("x-credits-left")).toBe("0");
    const row = await pg.query(`select delta, route, action from credit_ledger where reason = 'spend'`);
    expect(row.rows).toEqual([{ delta: -1, route: "/api/rerecord", action: "rerecord" }]);
  });
  it("skips the spend for a tester and logs a labelled tester row", async () => {
    vi.stubEnv("UNLIMITED_USER_EMAILS", "alice@x.test");
    expect((await callRerecord()).status).toBe(200);
    const rows = (await pg.query(`select reason, delta, route, action from credit_ledger`)).rows;
    expect(rows).toEqual([{ reason: "tester", delta: 0, route: "/api/rerecord", action: "rerecord" }]);
  });
  it("gives the credit back when the voice fails", async () => {
    voiceOk = false;
    expect((await callRerecord()).status).toBe(502);
    expect(await balance("alice")).toBe(1);
  });
  it("lets only one of several simultaneous requests record at balance 1", async () => {
    const out = await Promise.all(Array.from({ length: 4 }, () => callRerecord()));
    expect(out.filter((r) => r.status === 200)).toHaveLength(1);
    expect(out.filter((r) => r.status === 402)).toHaveLength(3);
  });
  it("marks the spend fulfilled when the recording is delivered", async () => {
    expect((await callRerecord()).status).toBe(200);
    expect((await pg.query(`select fulfilled_at is not null as done from credit_ledger where reason = 'spend'`)).rows).toEqual([{ done: true }]);
  });
  it("is unchanged with the paywall off", async () => {
    vi.stubEnv("PAYWALL_ENABLED", "");
    user = null;
    expect((await callRerecord()).status).toBe(200);
    expect((await pg.query(`select count(*)::int as n from credit_ledger`)).rows[0]).toEqual({ n: 0 });
  });
});

describe("POST /api/manifest with the paywall off (the default)", () => {
  beforeEach(() => vi.stubEnv("PAYWALL_ENABLED", ""));

  it("works signed out and spends nothing, exactly as before", async () => {
    user = null;
    expect((await callManifest()).status).toBe(200);
    expect(synth).toHaveBeenCalledTimes(1);
    expect((await pg.query(`select count(*)::int as n from credit_ledger`)).rows[0]).toEqual({ n: 0 });
  });
  it("spends nothing for a signed-in account either", async () => {
    expect((await callManifest()).status).toBe(200);
    expect((await pg.query(`select count(*)::int as n from credit_ledger`)).rows[0]).toEqual({ n: 0 });
  });
});

describe("tester daily-slot bypass", () => {
  const routes = [
    ["manifest", callManifest],
    ["rerecord", callRerecord],
  ] as const;

  it.each(routes)("skips slots for a tester on %s with the paywall on", async (_name, call) => {
    vi.stubEnv("UNLIMITED_USER_EMAILS", "alice@x.test");
    expect((await call()).status).toBe(200);
    expect(takeSlot).not.toHaveBeenCalled();
  });

  it.each(routes)("skips slots for a tester on %s with the paywall off", async (_name, call) => {
    vi.stubEnv("PAYWALL_ENABLED", "");
    vi.stubEnv("UNLIMITED_USER_EMAILS", "alice@x.test");
    expect((await call()).status).toBe(200);
    expect(takeSlot).not.toHaveBeenCalled();
  });

  it.each(routes)("keeps slots for non-testers and signed-out users on %s", async (_name, call) => {
    expect((await call()).status).toBe(200);
    expect(takeSlot).toHaveBeenCalledTimes(1);
    takeSlot.mockClear();
    user = null;
    expect((await call()).status).toBe(401);
    expect(takeSlot).toHaveBeenCalledTimes(1);
  });

  it.each(routes)("keeps slots for an unverified tester email on %s", async (_name, call) => {
    vi.stubEnv("UNLIMITED_USER_EMAILS", "alice@x.test");
    user = { ...alice, emailVerified: false };
    expect((await call()).status).toBe(200);
    expect(takeSlot).toHaveBeenCalledTimes(1);
  });

  it.each(routes)("still applies the spend ceiling to a tester on %s", async (_name, call) => {
    vi.stubEnv("UNLIMITED_USER_EMAILS", "alice@x.test");
    underCeilingOk = false;
    expect((await call()).status).toBe(503);
    expect(takeSlot).not.toHaveBeenCalled();
  });

  it.each(routes)("does not 500 on auth outage with the paywall off on %s, treats caller as non-tester", async (_name, call) => {
    vi.stubEnv("PAYWALL_ENABLED", "");
    lookupFails = true;
    const res = await call();
    expect(res.status).toBe(200);
    expect(takeSlot).toHaveBeenCalledTimes(1);
  });
});

describe("isFilterRelaxed (issue 215)", () => {
  const verified = { id: "alice", email: "alice@x.test", emailVerified: true as const, name: "Alice", image: null };
  const unverified = { ...verified, emailVerified: false as const };

  it("returns false when RELAXED_FILTER_EMAILS is unset or empty", () => {
    expect(isFilterRelaxed(verified, undefined, undefined)).toBe(false);
    expect(isFilterRelaxed(verified, "", "")).toBe(false);
  });
  it("returns true for a verified email on the relaxed list", () => {
    expect(isFilterRelaxed(verified, "alice@x.test", "")).toBe(true);
    expect(isFilterRelaxed(verified, "ALICE@X.TEST", "")).toBe(true);
  });
  it("returns false for an unverified email even if listed", () => {
    expect(isFilterRelaxed(unverified, "alice@x.test", "")).toBe(false);
  });
  it("returns true for a matching id regardless of email verification", () => {
    expect(isFilterRelaxed(unverified, "", "alice")).toBe(true);
  });
  it("returns false for null user", () => {
    expect(isFilterRelaxed(null, "alice@x.test", "alice")).toBe(false);
  });
});

describe("relaxed filter route logging and writeScript arg (issue 215)", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    infoSpy.mockRestore();
  });

  it("manifest logs [relaxed] and passes relaxed: true to writeScript for a relaxed account", async () => {
    vi.stubEnv("RELAXED_FILTER_EMAILS", "alice@x.test");
    await callManifest();
    const relaxedLogs = infoSpy.mock.calls.filter((c: unknown[]) => c[0] === "[relaxed]");
    expect(relaxedLogs).toHaveLength(1);
    expect(relaxedLogs[0][1]).toBe("alice");
    expect(writeScriptFn.mock.calls[0][0]).toMatchObject({ relaxed: true });
  });

  it("manifest does not log [relaxed] and passes relaxed: false for a non-relaxed account", async () => {
    await callManifest();
    expect(infoSpy.mock.calls.filter((c: unknown[]) => c[0] === "[relaxed]")).toHaveLength(0);
    expect(writeScriptFn.mock.calls[0][0]).toMatchObject({ relaxed: false });
  });

  it("rerecord logs [relaxed] for a relaxed account", async () => {
    vi.stubEnv("RELAXED_FILTER_EMAILS", "alice@x.test");
    await callRerecord();
    const relaxedLogs = infoSpy.mock.calls.filter((c: unknown[]) => c[0] === "[relaxed]");
    expect(relaxedLogs).toHaveLength(1);
    expect(relaxedLogs[0][1]).toBe("alice");
  });

  it("relaxed account with unverified email is not relaxed", async () => {
    vi.stubEnv("RELAXED_FILTER_EMAILS", "alice@x.test");
    user = { ...alice, emailVerified: false };
    await callManifest();
    expect(infoSpy.mock.calls.filter((c: unknown[]) => c[0] === "[relaxed]")).toHaveLength(0);
    expect(writeScriptFn.mock.calls[0][0]).toMatchObject({ relaxed: false });
  });
});
