// The credits ledger in Postgres (#168). Balance is the sum of credit_ledger.delta.
// Takes any client with `query(text, params)`, so tests run on PGlite.
//
// grantPurchase and spendCredit take a per-account advisory lock, so call them inside one
// transaction (withTx): the lock is held to its end. Under READ COMMITTED a second statement
// sees the first transaction's rows only after the lock is released, which is what makes two
// spends at balance 1 safe.
import { productOf } from "@/lib/credits";
import type { Db } from "@/lib/server/libraryDb";

const lock = (db: Db, userId: string) => db.query(`select pg_advisory_xact_lock(hashtextextended($1, 811027168))`, [userId]);

export async function creditBalance(db: Db, userId: string): Promise<number> {
  const { rows } = await db.query(`select coalesce(sum(delta), 0)::int as balance from credit_ledger where user_id = $1`, [userId]);
  return Number(rows[0].balance);
}

/** The free allowance, once per account (the unique once_key makes a second call a no-op). Returns true when it was just given. */
export async function ensureFreeCredit(db: Db, userId: string, amount: number): Promise<boolean> {
  if (!(amount > 0)) return false;
  const { rows } = await db.query(
    `insert into credit_ledger (user_id, delta, reason, once_key) values ($1, $2, 'free', 'free')
     on conflict (user_id, once_key) do nothing returning id`,
    [userId, amount],
  );
  return rows.length > 0;
}

/** What a spend, refund or tester row paid for. */
export type Charge = { cost: number; route: string; action: string };

/** Takes `cost` credits if the balance allows it, labelled with the route and action. Run inside a transaction. */
export async function spendCredit(db: Db, userId: string, c: Charge): Promise<{ ok: boolean; balance: number }> {
  await lock(db, userId);
  const { rows } = await db.query(
    `insert into credit_ledger (user_id, delta, reason, route, action)
     select $1::text, -($2::int), 'spend', $3::text, $4::text
      where (select coalesce(sum(delta), 0) from credit_ledger where user_id = $1::text) >= $2::int
     returning id`,
    [userId, c.cost, c.route, c.action],
  );
  return { ok: rows.length > 0, balance: await creditBalance(db, userId) };
}

/** Gives back the credits of a recording that failed. */
export async function refundCredit(db: Db, userId: string, c: Charge): Promise<void> {
  await db.query(`insert into credit_ledger (user_id, delta, reason, route, action) values ($1, $2, 'refund', $3, $4)`, [userId, c.cost, c.route, c.action]);
}

/** A recording by an unlimited tester: no change to the balance, but a row, so the cost stays countable. */
export async function logTesterSpend(db: Db, userId: string, c: Charge): Promise<void> {
  await db.query(`insert into credit_ledger (user_id, delta, reason, route, action) values ($1, 0, 'tester', $2, $3)`, [userId, c.route, c.action]);
}

export async function hasStarter(db: Db, userId: string): Promise<boolean> {
  const { rows } = await db.query(`select 1 from credit_ledger where user_id = $1 and once_key = 'starter' limit 1`, [userId]);
  return rows.length > 0;
}

export type GrantResult = "granted" | "duplicate" | "already_owned" | "unknown_product";

/**
 * Adds a purchased pack's credits. The RevenueCat event id is the idempotency key: a repeated event adds nothing.
 * A starter pack bought a second time (a new event) adds nothing either, but is recorded with delta 0 so it can be refunded by hand.
 * Run inside a transaction.
 */
export async function grantPurchase(
  db: Db,
  p: { userId: string; productId: string; eventId: string; environment?: string | null },
): Promise<GrantResult> {
  const product = productOf(p.productId);
  if (!product) return "unknown_product";
  await lock(db, p.userId);
  if ((await db.query(`select 1 from credit_ledger where source_id = $1`, [p.eventId])).rows.length) return "duplicate";
  const owned = product.oncePerAccount && (await db.query(`select 1 from credit_ledger where user_id = $1 and once_key = $2`, [p.userId, p.productId])).rows.length > 0;
  const { rows } = await db.query(
    `insert into credit_ledger (user_id, delta, reason, product_id, source_id, once_key, environment)
     values ($1, $2, 'purchase', $3, $4, $5, $6)
     on conflict do nothing returning id`,
    [p.userId, owned ? 0 : product.credits, p.productId, p.eventId, owned || !product.oncePerAccount ? null : p.productId, p.environment ?? null],
  );
  if (!rows.length) return "duplicate";
  return owned ? "already_owned" : "granted";
}

/** The first of these ids that is an account, in order, or null. Maps a RevenueCat app user id (and its aliases) to our account id. */
export async function firstExistingUser(db: Db, ids: string[]): Promise<string | null> {
  const clean = ids.filter((i) => typeof i === "string" && i.length > 0 && i.length <= 200);
  if (!clean.length) return null;
  const { rows } = await db.query(`select id from "user" where id = any($1::text[])`, [clean]);
  const found = new Set(rows.map((r) => String(r.id)));
  return clean.find((i) => found.has(i)) ?? null;
}
