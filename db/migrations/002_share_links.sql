-- 002: public share links for a manifestation.
--
-- A share is a frozen copy of a title and script, readable by anyone with the
-- link, until its owner revokes it (the row is deleted). It does not depend on
-- accounts: the person who made it holds a random owner token, and only its
-- SHA-256 is stored here. When accounts are on and the person is signed in,
-- user_id is filled too, so deleting the account deletes the user's shares.
--
-- Additive only.

create table if not exists share_link (
  id               text primary key,             -- 22 url-safe random characters
  owner_token_hash text not null,                -- sha256(owner token), hex
  user_id          text references "user"("id") on delete cascade,
  title            text not null check (char_length(title) between 1 and 80),
  lines            jsonb not null check (jsonb_typeof(lines) = 'array'),
  voice_name       text not null default '',
  manifestation_id text,                         -- which saved manifestation it copies, so a signed-in owner can revoke it from any device
  created_at       timestamptz not null default now()
);
create index if not exists share_link_user_idx on share_link(user_id, manifestation_id);
