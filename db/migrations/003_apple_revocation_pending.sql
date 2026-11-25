-- Sign in with Apple grants still to revoke after an account was deleted (#98, App Review 5.1.1(v)).
-- A row is written in the same transaction that deletes the account and removed once Apple accepts
-- the revocation, so a grant is never forgotten when Apple is unreachable. Rows carry no user id:
-- the account is gone. The token is the same value the "account" table held (or the refresh token
-- from the app's authorization code), and it is useless once revoked.
-- Additive only: one new table, no change to any existing table or row.
create table if not exists apple_revocation_pending (
  id             bigint generated always as identity primary key,
  client_id      text not null,                -- the Services ID or bundle id the token was issued to
  token          text not null,
  token_hint     text not null check (token_hint in ('refresh_token', 'access_token')),
  attempts       integer not null default 0,
  created_at     timestamptz not null default now(),
  last_tried_at  timestamptz
);
create index if not exists apple_revocation_pending_tried_idx on apple_revocation_pending (last_tried_at nulls first, id);
