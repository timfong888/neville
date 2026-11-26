// Concurrent spends on a REAL Postgres (#168). PGlite is one connection, so it cannot show the per-account
// advisory lock working; this does, with separate connections and real transactions.
//
// Runs only when DATABASE_URL is set. Point it at a throwaway Neon branch that already has migration 004
// applied (npm run migrate), never at production. It adds users named cc-test-<uuid> and removes them after.
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creditBalance, ensureFreeCredit, grantPurchase, spendCredit } from "@/lib/server/creditsDb";
import type { Db } from "@/lib/server/libraryDb";

const url = process.env.DATABASE_URL?.trim();
const M = { cost: 1, route: "/api/manifest", action: "manifest" };

const suite = url ? describe : describe.skip;

suite(
  url
    ? "concurrent credits on a real Postgres (DATABASE_URL)"
    : "concurrent credits on a real Postgres: SKIPPED, set DATABASE_URL to a throwaway Neon branch with migration 004 applied",
  () => {
    let pool: pg.Pool;
    const ids: string[] = [];
    const run = async <T>(fn: (db: Db) => Promise<T>): Promise<T> => {
      const c = await pool.connect();
      try {
        await c.query("begin");
        const out = await fn(c as unknown as Db);
        await c.query("commit");
        return out;
      } catch (e) {
        await c.query("rollback").catch(() => undefined);
        throw e;
      } finally {
        c.release();
      }
    };
    const newUser = async () => {
      const id = `cc-test-${randomUUID()}`;
      ids.push(id);
      await pool.query(`insert into "user" (id, name, email, "emailVerified") values ($1, $1, $1 || '@x.test', true)`, [id]);
      return id;
    };

    beforeAll(async () => {
      pool = new pg.Pool({ connectionString: url, max: 12 });
      const t = await pool.query(`select to_regclass('credit_ledger') as t`);
      if (!t.rows[0].t) throw new Error("credit_ledger is missing: apply migration 004 to this database first (npm run migrate)");
    });
    afterAll(async () => {
      if (ids.length) await pool.query(`delete from "user" where id = any($1::text[])`, [ids]);
      await pool.end();
    });

    it("lets exactly one of 10 simultaneous spends win at balance 1", async () => {
      const id = await newUser();
      await run((d) => ensureFreeCredit(d, id, 1));
      const out = await Promise.all(Array.from({ length: 10 }, () => run((d) => spendCredit(d, id, M))));
      expect(out.filter((r) => r.ok)).toHaveLength(1);
      expect(await creditBalance(pool as unknown as Db, id)).toBe(0);
    });

    it("grants a purchase once when the same transaction arrives on 6 connections at once", async () => {
      const id = await newUser();
      const out = await Promise.all(
        Array.from({ length: 6 }, () => run((d) => grantPurchase(d, { userId: id, productId: "pack10", eventId: `txn:${id}`, environment: "SANDBOX" }))),
      );
      expect(out.filter((r) => r === "granted")).toHaveLength(1);
      expect(await creditBalance(pool as unknown as Db, id)).toBe(10);
    });

    it("grants the free credit once across connections", async () => {
      const id = await newUser();
      await Promise.all(Array.from({ length: 6 }, () => run((d) => ensureFreeCredit(d, id, 1))));
      expect(await creditBalance(pool as unknown as Db, id)).toBe(1);
    });
  },
);
