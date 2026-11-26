-- 004: the credits ledger (#168). One row per grant or spend; an account's balance is the sum of delta.
-- Additive only: one new table, no change to any existing table or row. Roll back with
-- db/rollback/004_credit_ledger.down.sql (kept outside this folder so the runner never applies it).
--
--   reason   free      the free allowance, once per account      delta > 0
--            purchase  a RevenueCat purchase (or a repeat       delta > 0, or 0 for a second
--                      starter pack that adds nothing)           starter pack
--            spend     one recording                             delta < 0
--            refund    a spend returned after a failed recording delta > 0
--            tester    a recording by an unlimited tester        delta = 0, so cost stays visible
--   source_id   the RevenueCat event id; unique, so a repeated event can never grant twice
--   once_key    set on a grant that may happen once per account ('free', 'starter'); unique per account
create table if not exists credit_ledger (
  id           bigint generated always as identity primary key,
  user_id      text not null references "user"("id") on delete cascade,
  delta        integer not null,
  reason       text not null check (reason in ('free', 'purchase', 'spend', 'refund', 'tester')),
  product_id   text,
  source_id    text,
  once_key     text,
  environment  text,
  created_at   timestamptz not null default now(),
  constraint credit_ledger_delta_matches_reason check (
    (reason in ('free', 'purchase', 'refund') and delta >= 0)
    or (reason = 'spend' and delta < 0)
    or (reason = 'tester' and delta = 0)
  ),
  constraint credit_ledger_source_unique unique (source_id),
  constraint credit_ledger_once_unique unique (user_id, once_key)
);
create index if not exists credit_ledger_user_idx on credit_ledger (user_id, created_at);
