-- 001: accounts (Better Auth core tables) and the saved library.
-- Matches docs/specs/architecture.md "Data model", plus playlists (issue #12).
-- Every user-owned row hangs off "user" with ON DELETE CASCADE, so deleting
-- the user row deletes everything in one statement (issue #13).

-- Better Auth core schema, as better-auth 1.7 expects it (camelCase columns).
create table if not exists "user" (
  "id"            text primary key,
  "name"          text not null,
  "email"         text not null unique,
  "emailVerified" boolean not null,
  "image"         text,
  "createdAt"     timestamptz not null default now(),
  "updatedAt"     timestamptz not null default now()
);

create table if not exists "session" (
  "id"          text primary key,
  "expiresAt"   timestamptz not null,
  "token"       text not null unique,
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now(),
  "ipAddress"   text,
  "userAgent"   text,
  "userId"      text not null references "user"("id") on delete cascade
);
create index if not exists session_user_idx on "session"("userId");

create table if not exists "account" (
  "id"                    text primary key,
  "accountId"             text not null,
  "providerId"            text not null,
  "userId"                text not null references "user"("id") on delete cascade,
  "accessToken"           text,
  "refreshToken"          text,
  "idToken"               text,
  "accessTokenExpiresAt"  timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope"                 text,
  "password"              text,
  "createdAt"             timestamptz not null default now(),
  "updatedAt"             timestamptz not null default now()
);
create index if not exists account_user_idx on "account"("userId");

create table if not exists "verification" (
  "id"          text primary key,
  "identifier"  text not null,
  "value"       text not null,
  "expiresAt"   timestamptz not null,
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now()
);

-- One profile per signed-in person. Anonymous device profiles come later (#3 step 2).
create table if not exists profile (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null unique references "user"("id") on delete cascade,
  first_name  text,
  plan        text not null default 'free',
  created_at  timestamptz not null default now()
);

-- The client chooses ids (uuid) so a save can be retried without duplicating.
create table if not exists manifestation (
  id           uuid primary key,
  profile_id   uuid not null references profile(id) on delete cascade,
  title        text not null check (length(title) between 1 and 80),
  description  text not null check (length(description) <= 280),
  first_name   text not null default '' check (length(first_name) <= 40),
  is_library   boolean not null default false,
  share_slug   text unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists manifestation_profile_idx on manifestation(profile_id, created_at desc);

-- One script and its audio. The newest rendition is the one played; AI
-- variations will add more rows per manifestation.
create table if not exists rendition (
  id                uuid primary key default gen_random_uuid(),
  manifestation_id  uuid not null references manifestation(id) on delete cascade,
  script            jsonb not null,  -- array of spoken lines
  voice_id          text not null default '',
  voice_name        text not null default '',
  audio_key         text,            -- storage URL; null = device voice reads it
  audio_mime        text,
  audio_bytes       bigint not null default 0,  -- counts toward the account's storage quota
  created_at        timestamptz not null default now()
);
create index if not exists rendition_manifestation_idx on rendition(manifestation_id, created_at desc);

create table if not exists playlist (
  id          uuid primary key,
  profile_id  uuid not null references profile(id) on delete cascade,
  name        text not null check (length(name) between 1 and 60),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists playlist_profile_idx on playlist(profile_id);

create table if not exists playlist_item (
  playlist_id       uuid not null references playlist(id) on delete cascade,
  manifestation_id  uuid not null references manifestation(id) on delete cascade,
  position          int not null,
  primary key (playlist_id, manifestation_id)
);

-- Recordings waiting to be removed from Blob storage. A key is written here in
-- the same transaction that removes its last row, so a Blob outage can never
-- leave a recording with no record of it; keys are deleted from here only
-- after Blob confirms the file is gone, and are retried on later deletions.
create table if not exists blob_tombstone (
  key         text primary key,
  created_at  timestamptz not null default now()
);
