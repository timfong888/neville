-- 002: public share links for a manifestation.
--
-- A share is a frozen copy of a title and script, readable by anyone with the
-- link (no account needed to open it), until its maker revokes it: the row is
-- deleted. Only a signed-in person can make one, so every link belongs to an
-- account and to one of that account's saved manifestations. The maker can
-- revoke it from any device; deleting the manifestation or the account
-- deletes its links.
--
-- Additive only.

create table if not exists share_link (
  id               text primary key check (id ~ '^[A-Za-z0-9_-]{22}$'),
  user_id          text not null references "user"("id") on delete cascade,
  manifestation_id uuid not null references manifestation(id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 80),
  lines            jsonb not null check (jsonb_typeof(lines) = 'array'),
  voice_name       text not null default '',
  created_at       timestamptz not null default now()
);
create index if not exists share_link_owner_idx on share_link(user_id, manifestation_id);
create index if not exists share_link_made_idx on share_link(user_id, created_at desc);
