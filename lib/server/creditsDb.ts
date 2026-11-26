// The credits ledger in Postgres (#168). Balance is the sum of credit_ledger.delta.
// Takes any client with `query(text, params)`, so tests run on PGlite.
//
// grantPurchase and spendCredit take a per-account advisory lock, so call them inside one
// transaction (withTx): the lock is held to its end. Under READ COMMITTED a second statement
// sees the first transaction's rows only after the lock is released, which is what makes two
// spends at balance 1 safe.
import { CREDITS, productOf } from "@/lib/credits";
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
export async function spendCredit(db: Db, userId: string, c: Charge): Promise<{ ok: boolean; balance: number; spendId?: string }> {
  await lock(db, userId);
  const { rows } = await db.query(
    `insert into credit_ledger (user_id, delta, reason, route, action)
     select $1::text, -($2::int), 'spend', $3::text, $4::text
      where (select coalesce(sum(delta), 0) from credit_ledger where user_id = $1::text) >= $2::int
     returning id`,
    [userId, c.cost, c.route, c.action],
  );
  return { ok: rows.length > 0, balance: await creditBalance(db, userId), ...(rows.length ? { spendId: String(rows[0].id) } : {}) };
}

/**
 * Gives back the credits of a recording that failed. Keyed to the spend row (source_id "refund:<spendId>"), so
 * retrying after a database error, or calling it twice, returns the credits exactly once.
 */
export async function refundCredit(db: Db, userId: string, c: Charge, spendId: string): Promise<void> {
  await db.query(
    `insert into credit_ledger (user_id, delta, reason, route, action, source_id) values ($1, $2, 'refund', $3, $4, $5)
     on conflict (source_id) do nothing`,
    [userId, c.cost, c.route, c.action, `refund:${spendId}`],
  );
}

/** A recording by an unlimited tester: no change to the balance, but a row, so the cost stays countable. */
export async function logTesterSpend(db: Db, userId: string, c: Charge): Promise<void> {
  await db.query(`insert into credit_ledger (user_id, delta, reason, route, action) values ($1, 0, 'tester', $2, $3)`, [userId, c.route, c.action]);
}

/** Marks a spend as delivered: the recording was made and sent, so reconciliation never refunds it. */
export async function markFulfilled(db: Db, spendId: string): Promise<void> {
  // Never on a spend that was already refunded: that recording was not delivered, and stamping it would hide it from reconciliation.
  await db.query(
    `update credit_ledger set fulfilled_at = now()
      where id = $1::bigint and reason = 'spend'
        and not exists (select 1 from credit_ledger r where r.source_id = 'refund:' || $1::text)`,
    [spendId],
  );
}

/**
 * Refunds spends the function never finished: older than `olderThanSeconds` (use more than the routes' maxDuration),
 * not marked fulfilled, and with no refund yet. The refund is keyed to the spend, so running this twice, or racing a
 * late in-request refund, returns each credit once. Returns how many it refunded. With `userId` it heals one account only (the paid
 * routes and GET /api/credits call it that way); without it, every account (not scheduled anywhere yet: for a later job or by hand).
 */
export async function reconcileUnfulfilledSpends(
  db: Db,
  o: { olderThanSeconds?: number; limit?: number; userId?: string } = {},
): Promise<number> {
  const { rows } = await db.query(
    `insert into credit_ledger (user_id, delta, reason, route, action, source_id)
     select s.user_id, -s.delta, 'refund', s.route, s.action, 'refund:' || s.id::text
       from credit_ledger s
      where s.reason = 'spend' and s.fulfilled_at is null
        and s.created_at < now() - ($1::int * interval '1 second')
        and ($3::text is null or s.user_id = $3::text)
        and not exists (select 1 from credit_ledger r where r.source_id = 'refund:' || s.id::text)
      order by s.id
      limit $2::int
     on conflict (source_id) do nothing
     returning id`,
    [o.olderThanSeconds ?? 120, o.limit ?? 500, o.userId ?? null],
  );
  return rows.length;
}

/** True once a real (production) Starter was bought. A sandbox Starter, from a TestFlight test, does not count. */
export async function hasStarter(db: Db, userId: string): Promise<boolean> {
  const { rows } = await db.query(`select 1 from credit_ledger where user_id = $1 and once_key = 'starter' limit 1`, [userId]);
  return rows.length > 0;
}

export type GrantResult = "granted" | "duplicate" | "already_owned" | "unknown_product" | "sandbox_capped";

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
  // Once-per-account packs are owned per environment: a sandbox purchase (a TestFlight test) must never make the real one grant nothing.
  const onceKey = product.oncePerAccount ? (p.environment === "SANDBOX" ? `${p.productId}:sandbox` : p.productId) : null;
  const owned = onceKey !== null && (await db.query(`select 1 from credit_ledger where user_id = $1 and once_key = $2`, [p.userId, onceKey])).rows.length > 0;
  // Sandbox purchases are free, so what an account can hold from them is capped; production grants never are.
  let capped = false;
  if (!owned && p.environment === "SANDBOX") {
    const held = Number(
      (await db.query(`select coalesce(sum(delta), 0)::int as n from credit_ledger where user_id = $1 and reason = 'purchase' and environment = 'SANDBOX'`, [p.userId])).rows[0].n,
    );
    capped = held + product.credits > CREDITS.sandboxGrantCap;
  }
  const { rows } = await db.query(
    `insert into credit_ledger (user_id, delta, reason, product_id, source_id, once_key, environment)
     values ($1, $2, 'purchase', $3, $4, $5, $6)
     on conflict do nothing returning id`,
    [p.userId, owned || capped ? 0 : product.credits, p.productId, p.eventId, owned || capped ? null : onceKey, p.environment ?? null],
  );
  if (!rows.length) return "duplicate";
  return capped ? "sandbox_capped" : owned ? "already_owned" : "granted";
}

/** The first of these ids that is an account, in order, or null. Maps a RevenueCat app user id (and its aliases) to our account id. */
export async function firstExistingUser(db: Db, ids: string[]): Promise<string | null> {
  const clean = ids.filter((i) => typeof i === "string" && i.length > 0 && i.length <= 200);
  if (!clean.length) return null;
  const { rows } = await db.query(`select id from "user" where id = any($1::text[])`, [clean]);
  const found = new Set(rows.map((r) => String(r.id)));
  return clean.find((i) => found.has(i)) ?? null;
}
