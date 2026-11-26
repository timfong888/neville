// The credits ledger on PGlite (#168): free once, atomic spend, purchase idempotency,
// starter once per account, tester rows, and the migration on empty and populated databases.
import { PGlite } from "@electric-sql/pglite";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script, no type declarations
import { runMigrations } from "../scripts/migrate-core.mjs";
import { CREDITS, availablePacks, isUnlimited, paywallEnabled, unlimitedEmails } from "@/lib/credits";
import {
  creditBalance,
  ensureFreeCredit,
  firstExistingUser,
  grantPurchase,
  hasStarter,
  logTesterSpend,
  refundCredit,
  spendCredit,
} from "@/lib/server/creditsDb";
import type { Db } from "@/lib/server/libraryDb";

let pg: PGlite;
let db: Db;
const tx = <T>(fn: (d: Db) => Promise<T>): Promise<T> =>
  pg.transaction((t) => fn({ query: (q, p) => t.query(q, p) as Promise<{ rows: Record<string, unknown>[] }> }));

const client = {
  query: async (text: string, params?: unknown[]) => {
    if (params) return pg.query(text, params);
    const r = await pg.exec(text);
    return r[r.length - 1] ?? { rows: [] };
  },
};
const quiet = () => undefined;
const M = { cost: 1, route: "/api/manifest", action: "manifest" };

async function addUser(id: string) {
  await pg.query(`insert into "user" (id, name, email, "emailVerified") values ($1, $1, $1 || '@x.test', true)`, [id]);
}

beforeEach(async () => {
  pg = new PGlite();
  await runMigrations(client, path.join(process.cwd(), "db", "migrations"), quiet);
  db = { query: (q, p) => pg.query(q, p) as Promise<{ rows: Record<string, unknown>[] }> };
  await addUser("alice");
  await addUser("bob");
});

describe("config helpers", () => {
  it("reads the comma list of tester emails, trimmed and case-insensitive", () => {
    expect([...unlimitedEmails(" Tim@X.com, ,b@y.com ")]).toEqual(["tim@x.com", "b@y.com"]);
    expect(unlimitedEmails(undefined).size).toBe(0);
  });
  it("is unlimited only for a verified, listed email", () => {
    expect(isUnlimited({ email: "TIM@x.com", emailVerified: true }, "tim@x.com")).toBe(true);
    expect(isUnlimited({ email: "tim@x.com", emailVerified: false }, "tim@x.com")).toBe(false);
    expect(isUnlimited({ email: "tim@x.com" }, "tim@x.com")).toBe(false);
    expect(isUnlimited({ email: "eve@x.com", emailVerified: true }, "tim@x.com")).toBe(false);
    expect(isUnlimited(null, "tim@x.com")).toBe(false);
    expect(isUnlimited({ email: "tim@x.com", emailVerified: true }, "")).toBe(false);
  });
  it("is unlimited for a listed account id, whatever the email (Apple private relay), verified or not", () => {
    expect(isUnlimited({ id: "u-tim", email: "abc@privaterelay.appleid.com", emailVerified: false }, "", "u-tim, u-other")).toBe(true);
    expect(isUnlimited({ id: "u-eve", email: "eve@x.com", emailVerified: true }, "", "u-tim")).toBe(false);
    expect(isUnlimited({ email: "eve@x.com", emailVerified: true }, "", "u-tim")).toBe(false);
    expect(isUnlimited({ id: "", email: "e@x.com" }, "", ",")).toBe(false);
  });
  it("is off unless PAYWALL_ENABLED is exactly true", () => {
    expect(paywallEnabled({})).toBe(false);
    expect(paywallEnabled({ PAYWALL_ENABLED: "false" })).toBe(false);
    expect(paywallEnabled({ PAYWALL_ENABLED: "1" })).toBe(false);
    expect(paywallEnabled({ PAYWALL_ENABLED: " TRUE " })).toBe(true);
  });
  it("keeps the credit cost of each action in config", () => {
    expect(CREDITS.costs).toEqual({ manifest: 1, rerecord: 1 });
  });
  it("offers starter only while it has not been bought", () => {
    expect(availablePacks(false).map((p) => p.id)).toEqual(["starter", "pack10"]);
    expect(availablePacks(true).map((p) => p.id)).toEqual(["pack10"]);
  });
});

describe("free credit", () => {
  it("is given once per account, even when asked twice or at the same time", async () => {
    await Promise.all([tx((d) => ensureFreeCredit(d, "alice", 1)), tx((d) => ensureFreeCredit(d, "alice", 1))]);
    await tx((d) => ensureFreeCredit(d, "alice", 1));
    expect(await creditBalance(db, "alice")).toBe(1);
    expect(await creditBalance(db, "bob")).toBe(0);
  });
  it("gives nothing when the allowance is 0", async () => {
    expect(await tx((d) => ensureFreeCredit(d, "alice", 0))).toBe(false);
    expect(await creditBalance(db, "alice")).toBe(0);
  });
});

describe("spending", () => {
  it("takes one credit and refuses at zero with the balance", async () => {
    await tx((d) => ensureFreeCredit(d, "alice", 1));
    expect(await tx((d) => spendCredit(d, "alice", M))).toMatchObject({ ok: true, balance: 0 });
    expect(await tx((d) => spendCredit(d, "alice", M))).toEqual({ ok: false, balance: 0 });
    expect(await creditBalance(db, "alice")).toBe(0);
  });
  it("lets only one of several concurrent spends win at balance 1", async () => {
    await tx((d) => ensureFreeCredit(d, "alice", 1));
    const results = await Promise.all(Array.from({ length: 6 }, () => tx((d) => spendCredit(d, "alice", M))));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await creditBalance(db, "alice")).toBe(0);
    const spends = await db.query(`select count(*)::int as n from credit_ledger where user_id = 'alice' and reason = 'spend'`);
    expect(spends.rows[0].n).toBe(1);
  });
  it("refunds a credit after a failed recording, once per spend however often it is retried", async () => {
    await tx((d) => ensureFreeCredit(d, "alice", 1));
    const spent = await tx((d) => spendCredit(d, "alice", M));
    expect(spent.spendId).toBeTruthy();
    await refundCredit(db, "alice", M, spent.spendId!);
    await refundCredit(db, "alice", M, spent.spendId!);
    await Promise.all([refundCredit(db, "alice", M, spent.spendId!), refundCredit(db, "alice", M, spent.spendId!)]);
    expect(await creditBalance(db, "alice")).toBe(1);
  });
  it("logs a tester spend row that does not change the balance", async () => {
    await logTesterSpend(db, "alice", M);
    await logTesterSpend(db, "alice", M);
    expect(await creditBalance(db, "alice")).toBe(0);
    const r = await db.query(`select count(*)::int as n from credit_ledger where user_id = 'alice' and reason = 'tester' and delta = 0`);
    expect(r.rows[0].n).toBe(2);
  });
});

describe("the cost of an action", () => {
  it("takes the configured cost, records route and action on the row, and refuses when the balance is short", async () => {
    await tx((d) => grantPurchase(d, { userId: "alice", productId: "starter", eventId: "e", environment: null }));
    const re = { cost: 2, route: "/api/rerecord", action: "rerecord" };
    expect(await tx((d) => spendCredit(d, "alice", re))).toMatchObject({ ok: true, balance: 1 });
    expect(await tx((d) => spendCredit(d, "alice", re))).toEqual({ ok: false, balance: 1 });
    const row = await db.query(`select delta, route, action from credit_ledger where reason = 'spend'`);
    expect(row.rows).toEqual([{ delta: -2, route: "/api/rerecord", action: "rerecord" }]);
  });
  it("refunds the same cost and labels the tester row", async () => {
    const re = { cost: 2, route: "/api/rerecord", action: "rerecord" };
    await tx((d) => grantPurchase(d, { userId: "alice", productId: "pack10", eventId: "e", environment: null }));
    const spent = await tx((d) => spendCredit(d, "alice", re));
    await refundCredit(db, "alice", re, spent.spendId!);
    await logTesterSpend(db, "alice", re);
    expect(await creditBalance(db, "alice")).toBe(10);
    const rows = await db.query(`select reason, delta, route, action from credit_ledger where route is not null order by id`);
    expect(rows.rows).toEqual([
      { reason: "spend", delta: -2, route: "/api/rerecord", action: "rerecord" },
      { reason: "refund", delta: 2, route: "/api/rerecord", action: "rerecord" },
      { reason: "tester", delta: 0, route: "/api/rerecord", action: "rerecord" },
    ]);
  });
});

describe("purchases", () => {
  const buy = (productId: string, eventId: string, userId = "alice") =>
    tx((d) => grantPurchase(d, { userId, productId, eventId, environment: "PRODUCTION" }));

  it("adds the pack's credits once when the same event arrives twice", async () => {
    expect(await buy("pack10", "evt_1")).toBe("granted");
    expect(await buy("pack10", "evt_1")).toBe("duplicate");
    expect(await creditBalance(db, "alice")).toBe(10);
  });
  it("adds credits once when the same event arrives at the same time", async () => {
    const out = await Promise.all([buy("pack10", "evt_2"), buy("pack10", "evt_2"), buy("pack10", "evt_2")]);
    expect(out.filter((o) => o === "granted")).toHaveLength(1);
    expect(await creditBalance(db, "alice")).toBe(10);
  });
  it("grants the starter pack once per account; a second starter event adds nothing and is remembered", async () => {
    expect(await buy("starter", "evt_a")).toBe("granted");
    expect(await hasStarter(db, "alice")).toBe(true);
    expect(await buy("starter", "evt_b")).toBe("already_owned");
    expect(await buy("starter", "evt_b")).toBe("duplicate");
    expect(await creditBalance(db, "alice")).toBe(3);
    expect(await hasStarter(db, "bob")).toBe(false);
  });
  it("keeps sandbox and production ownership of Starter apart: a sandbox Starter never blocks the real one", async () => {
    const buyIn = (environment: string, eventId: string) =>
      tx((d) => grantPurchase(d, { userId: "alice", productId: "starter", eventId, environment }));
    expect(await buyIn("SANDBOX", "sb1")).toBe("granted");
    expect(await hasStarter(db, "alice")).toBe(false); // the app still offers the real Starter
    expect(await buyIn("SANDBOX", "sb2")).toBe("already_owned");
    expect(await buyIn("PRODUCTION", "pr1")).toBe("granted");
    expect(await hasStarter(db, "alice")).toBe(true);
    expect(await buyIn("PRODUCTION", "pr2")).toBe("already_owned");
    expect(await creditBalance(db, "alice")).toBe(6);
  });
  it("treats an event with no environment as production", async () => {
    await tx((d) => grantPurchase(d, { userId: "alice", productId: "starter", eventId: "n1", environment: null }));
    expect(await hasStarter(db, "alice")).toBe(true);
  });
  it("lets pack10 be bought again and again", async () => {
    await buy("pack10", "evt_x");
    await buy("pack10", "evt_y");
    expect(await creditBalance(db, "alice")).toBe(20);
  });
  it("ignores a product it does not sell", async () => {
    expect(await buy("gold", "evt_z")).toBe("unknown_product");
    expect(await creditBalance(db, "alice")).toBe(0);
  });
});

describe("mapping an app user id", () => {
  it("finds the first id that is an account", async () => {
    expect(await firstExistingUser(db, ["$RCAnonymousID:abc", "bob", "alice"])).toBe("bob");
    expect(await firstExistingUser(db, ["$RCAnonymousID:abc"])).toBeNull();
    expect(await firstExistingUser(db, [])).toBeNull();
  });
});

describe("the migration", () => {
  it("applies on an empty database and the ledger starts empty", async () => {
    const n = await db.query(`select count(*)::int as n from credit_ledger`);
    expect(n.rows[0].n).toBe(0);
  });
  it("applies on a database that already has users and profiles, and leaves them as they were", async () => {
    const p = new PGlite();
    const dir = mkdtempSync(path.join(tmpdir(), "mig-"));
    try {
      for (const f of ["001_accounts_and_library.sql", "002_share_links.sql", "003_apple_revocation_pending.sql"]) {
        cpSync(path.join("db", "migrations", f), path.join(dir, f));
      }
      const c = {
        query: async (t: string, params?: unknown[]) => (params ? p.query(t, params) : (await p.exec(t)).at(-1) ?? { rows: [] }),
      };
      await runMigrations(c, dir, quiet);
      await p.query(`insert into "user" (id, name, email, "emailVerified") values ('old', 'Old', 'old@x.test', true)`);
      await p.query(`insert into profile (user_id, plan) values ('old', 'paid')`);
      const before = (await p.query(`select * from profile`)).rows;
      cpSync(path.join("db", "migrations", "004_credit_ledger.sql"), path.join(dir, "004_credit_ledger.sql"));
      await runMigrations(c, dir, quiet);
      expect((await p.query(`select * from profile`)).rows).toEqual(before);
      expect((await p.query(`select count(*)::int as n from credit_ledger`)).rows[0]).toEqual({ n: 0 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("is removed cleanly by its rollback script, leaving every other table", async () => {
    await pg.exec(readFileSync("db/rollback/004_credit_ledger.down.sql", "utf8"));
    const t = await db.query(`select to_regclass('credit_ledger') as t, to_regclass('profile') as p`);
    expect(t.rows[0]).toEqual({ t: null, p: "profile" });
  });
  it("deletes an account's ledger rows with the account", async () => {
    await tx((d) => ensureFreeCredit(d, "bob", 1));
    await db.query(`delete from "user" where id = 'bob'`);
    expect((await db.query(`select count(*)::int as n from credit_ledger where user_id = 'bob'`)).rows[0]).toEqual({ n: 0 });
  });
});

afterEach(async () => {
  await pg.close();
});
