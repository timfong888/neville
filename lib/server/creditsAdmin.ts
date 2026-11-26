// Read-only queries for the /admin/credits monitor page (#183).
// No INSERT, UPDATE, or DELETE here — this file is append-free by design.
import type { Db } from "@/lib/server/libraryDb";

export type CreditTotals = {
  granted: number;    // sum of free + purchase deltas (positive grants only)
  bought: number;     // sum of purchase deltas (positive)
  spent: number;      // absolute value of spend deltas
  spendCount: number; // number of spend rows (recordings charged)
  refunded: number;   // sum of refund deltas
  outstanding: number; // net balance = sum of all deltas
};

export async function creditsTotals(db: Db): Promise<CreditTotals> {
  const { rows } = await db.query(`
    select
      coalesce(sum(case when reason in ('free','purchase') and delta > 0 then delta else 0 end), 0)::int as granted,
      coalesce(sum(case when reason = 'purchase' and delta > 0 then delta else 0 end), 0)::int as bought,
      coalesce(sum(case when reason = 'spend' then -delta else 0 end), 0)::int as spent,
      count(case when reason = 'spend' then 1 end)::int as spend_count,
      coalesce(sum(case when reason = 'refund' then delta else 0 end), 0)::int as refunded,
      coalesce(sum(delta), 0)::int as outstanding
    from credit_ledger
  `);
  const r = rows[0];
  return {
    granted: Number(r.granted),
    bought: Number(r.bought),
    spent: Number(r.spent),
    spendCount: Number(r.spend_count),
    refunded: Number(r.refunded),
    outstanding: Number(r.outstanding),
  };
}

export type AccountSummary = {
  userId: string;
  email: string | null;
  granted: number;
  bought: number;
  spent: number;
  spendCount: number;
  refunded: number;
  outstanding: number;
};

export async function creditsPerAccount(db: Db): Promise<AccountSummary[]> {
  const { rows } = await db.query(`
    select
      cl.user_id,
      u.email,
      coalesce(sum(case when cl.reason in ('free','purchase') and cl.delta > 0 then cl.delta else 0 end), 0)::int as granted,
      coalesce(sum(case when cl.reason = 'purchase' and cl.delta > 0 then cl.delta else 0 end), 0)::int as bought,
      coalesce(sum(case when cl.reason = 'spend' then -cl.delta else 0 end), 0)::int as spent,
      count(case when cl.reason = 'spend' then 1 end)::int as spend_count,
      coalesce(sum(case when cl.reason = 'refund' then cl.delta else 0 end), 0)::int as refunded,
      coalesce(sum(cl.delta), 0)::int as outstanding
    from credit_ledger cl
    left join "user" u on u.id = cl.user_id
    group by cl.user_id, u.email
    order by coalesce(sum(case when cl.reason = 'spend' then -cl.delta else 0 end), 0) desc
  `);
  return rows.map((r) => ({
    userId: String(r.user_id),
    email: r.email != null ? String(r.email) : null,
    granted: Number(r.granted),
    bought: Number(r.bought),
    spent: Number(r.spent),
    spendCount: Number(r.spend_count),
    refunded: Number(r.refunded),
    outstanding: Number(r.outstanding),
  }));
}

export type SpecialCounts = {
  refunds: number;
  // purchase rows where delta=0 and SANDBOX, with no prior once_key grant for the same user+product
  sandboxCapped: number;
  // purchase rows where delta=0 and either non-SANDBOX, or SANDBOX with a prior once_key grant
  alreadyOwned: number;
};

export async function creditsSpecialCounts(db: Db): Promise<SpecialCounts> {
  const { rows } = await db.query(`
    select
      count(case when reason = 'refund' then 1 end)::int as refunds,
      count(case when reason = 'purchase' and delta = 0 and environment = 'SANDBOX'
        and not exists (
          select 1 from credit_ledger o
          where o.user_id = credit_ledger.user_id
            and o.once_key = credit_ledger.product_id || ':sandbox'
            and o.id < credit_ledger.id
        )
        then 1 end)::int as sandbox_capped,
      count(case when reason = 'purchase' and delta = 0 and (
        (environment is null or environment <> 'SANDBOX')
        or (environment = 'SANDBOX' and exists (
          select 1 from credit_ledger o
          where o.user_id = credit_ledger.user_id
            and o.once_key = credit_ledger.product_id || ':sandbox'
            and o.id < credit_ledger.id
        ))
      ) then 1 end)::int as already_owned
    from credit_ledger
  `);
  const r = rows[0];
  return {
    refunds: Number(r.refunds),
    sandboxCapped: Number(r.sandbox_capped),
    alreadyOwned: Number(r.already_owned),
  };
}
