// The saved library in Postgres. Every query is scoped to the caller's
// profile, so one person can never read or change another's rows.
// Takes any client with `query(text, params)`, so tests run on PGlite.
import {
  cleanTitle,
  type Library,
  type Manifestation,
  MAX_LINES,
  MAX_LINE,
  MAX_PLAYLIST_ITEMS,
  MAX_PLAYLIST_NAME,
  type Playlist,
} from "@/lib/library/model";

export type Db = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isId = (s: unknown): s is string => typeof s === "string" && UUID.test(s);

const ms = (v: unknown) => (v instanceof Date ? v.getTime() : new Date(String(v)).getTime());

export async function ensureProfile(db: Db, userId: string): Promise<string> {
  const { rows } = await db.query(
    `insert into profile (user_id) values ($1)
     on conflict (user_id) do update set user_id = excluded.user_id
     returning id`,
    [userId],
  );
  return String(rows[0].id);
}

export async function loadLibrary(db: Db, profileId: string): Promise<Library> {
  const m = await db.query(
    `select m.id, m.title, m.description, m.first_name, m.created_at, m.updated_at,
            r.script, r.voice_id, r.voice_name, r.audio_key
       from manifestation m
       left join lateral (
         select * from rendition where manifestation_id = m.id order by created_at desc limit 1
       ) r on true
      where m.profile_id = $1
      order by m.created_at desc`,
    [profileId],
  );
  const p = await db.query(
    `select p.id, p.name, p.created_at, p.updated_at,
            coalesce(array_agg(i.manifestation_id::text order by i.position) filter (where i.manifestation_id is not null), '{}') as items
       from playlist p left join playlist_item i on i.playlist_id = p.id
      where p.profile_id = $1
      group by p.id
      order by p.updated_at desc`,
    [profileId],
  );
  return {
    manifestations: m.rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      want: String(r.description),
      firstName: String(r.first_name ?? ""),
      lines: Array.isArray(r.script) ? (r.script as string[]) : [],
      voiceId: String(r.voice_id ?? ""),
      voiceName: String(r.voice_name ?? ""),
      hasAudio: !!r.audio_key,
      createdAt: ms(r.created_at),
      updatedAt: ms(r.updated_at),
    })),
    playlists: p.rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      itemIds: (r.items as string[]) ?? [],
      createdAt: ms(r.created_at),
      updatedAt: ms(r.updated_at),
    })),
  };
}

/** Validates a manifestation sent by a browser. Returns null when it is not acceptable. */
export function cleanManifestation(raw: unknown, id: string): Manifestation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === "string" ? cleanTitle(r.title) : "";
  const lines = Array.isArray(r.lines)
    ? r.lines.filter((l): l is string => typeof l === "string").map((l) => l.trim().slice(0, MAX_LINE)).filter(Boolean)
    : [];
  if (!title || !lines.length || lines.length > MAX_LINES) return null;
  const now = Date.now();
  const t = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= now + 60_000 ? v : now);
  return {
    id,
    title,
    want: typeof r.want === "string" ? r.want.slice(0, 280) : "",
    firstName: typeof r.firstName === "string" ? r.firstName.slice(0, 40) : "",
    lines,
    voiceId: typeof r.voiceId === "string" ? r.voiceId.slice(0, 80) : "",
    voiceName: typeof r.voiceName === "string" ? r.voiceName.slice(0, 80) : "",
    hasAudio: false,
    createdAt: t(r.createdAt),
    updatedAt: now,
  };
}

/**
 * Creates or replaces a manifestation and its current script.
 * `audio`: an object stores that recording; null removes it; undefined keeps the current one.
 * Returns the storage keys no longer referenced, for the caller to delete,
 * or null when the id belongs to someone else.
 */
export async function putManifestation(
  db: Db,
  profileId: string,
  m: Manifestation,
  audio: { key: string; mime: string; bytes?: number } | null | undefined,
): Promise<string[] | null> {
  const up = await db.query(
    `insert into manifestation (id, profile_id, title, description, first_name, created_at, updated_at)
     values ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0), now())
     on conflict (id) do update
       set title = excluded.title, description = excluded.description,
           first_name = excluded.first_name, updated_at = now()
       where manifestation.profile_id = excluded.profile_id
     returning id`,
    [m.id, profileId, m.title, m.want, m.firstName, m.createdAt],
  );
  if (!up.rows.length) return null;
  const old = await db.query(`select id, audio_key, audio_mime, audio_bytes from rendition where manifestation_id = $1`, [m.id]);
  const current = old.rows[0];
  const keep =
    audio === undefined && current?.audio_key
      ? { key: String(current.audio_key), mime: String(current.audio_mime ?? ""), bytes: Number(current.audio_bytes ?? 0) }
      : null;
  const next = audio ?? keep;
  await db.query(`delete from rendition where manifestation_id = $1`, [m.id]);
  await db.query(
    `insert into rendition (manifestation_id, script, voice_id, voice_name, audio_key, audio_mime, audio_bytes)
     values ($1, $2::jsonb, $3, $4, $5, $6, $7)`,
    [m.id, JSON.stringify(m.lines), m.voiceId, m.voiceName, next?.key ?? null, next?.mime ?? null, next ? (next.bytes ?? 0) : 0],
  );
  return old.rows.map((r) => r.audio_key).filter((k): k is string => typeof k === "string" && k !== next?.key);
}

// Per-account storage limits for recordings. Uploads are client-supplied and
// separate from generation limits, so they need their own ceiling.
export const MAX_ACCOUNT_AUDIO_BYTES = 200 * 1024 * 1024;
export const MAX_ACCOUNT_RECORDINGS = 200;
/** Uploads a user may have in flight at once (reserved but not yet saved). */
export const MAX_PENDING_UPLOADS = 3;

/** Recordings the profile holds now: count and total bytes. */
export async function audioUsage(db: Db, profileId: string): Promise<{ count: number; bytes: number }> {
  const { rows } = await db.query(
    `select count(*)::int as n, coalesce(sum(r.audio_bytes), 0)::bigint as b
       from rendition r join manifestation m on m.id = r.manifestation_id
      where m.profile_id = $1 and r.audio_key is not null`,
    [profileId],
  );
  return { count: Number(rows[0]?.n ?? 0), bytes: Number(rows[0]?.b ?? 0) };
}

/**
 * Why a new upload of `size` bytes is refused, or null if it fits. Counts what
 * is stored plus uploads still in flight (reserved keys not yet saved).
 */
export async function uploadRefusal(db: Db, userId: string, size: number): Promise<string | null> {
  const p = await db.query(`select id from profile where user_id = $1`, [userId]);
  const used = p.rows[0] ? await audioUsage(db, String(p.rows[0].id)) : { count: 0, bytes: 0 };
  const pending = await db.query(
    `select count(*)::int as n from blob_tombstone where key like $1 and created_at > now() - interval '10 minutes'`,
    [`audio/${userId}/%`],
  );
  const inFlight = Number(pending.rows[0]?.n ?? 0);
  if (inFlight >= MAX_PENDING_UPLOADS) return "Too many uploads at once. Try again in a minute.";
  if (used.count + inFlight >= MAX_ACCOUNT_RECORDINGS) return "Your account has reached its limit of saved recordings.";
  if (used.bytes + size > MAX_ACCOUNT_AUDIO_BYTES) return "Your account has reached its storage limit for recordings.";
  return null;
}

/** Deletes one manifestation; returns its storage keys, or null when it is not the caller's. */
export async function deleteManifestation(db: Db, profileId: string, id: string): Promise<string[] | null> {
  // Lock the row first, so a save cannot add a recording between reading the keys and deleting.
  await db.query(`select id from manifestation where id = $1 and profile_id = $2 for update`, [id, profileId]);
  const keys = await db.query(
    `select r.audio_key from rendition r join manifestation m on m.id = r.manifestation_id
      where m.id = $1 and m.profile_id = $2 and r.audio_key is not null`,
    [id, profileId],
  );
  const del = await db.query(`delete from manifestation where id = $1 and profile_id = $2 returning id`, [id, profileId]);
  if (!del.rows.length) return null;
  return keys.rows.map((r) => String(r.audio_key));
}

export async function getAudio(db: Db, profileId: string, id: string): Promise<{ key: string; mime: string } | null> {
  const { rows } = await db.query(
    `select r.audio_key, r.audio_mime from rendition r join manifestation m on m.id = r.manifestation_id
      where m.id = $1 and m.profile_id = $2 and r.audio_key is not null
      order by r.created_at desc limit 1`,
    [id, profileId],
  );
  return rows[0] ? { key: String(rows[0].audio_key), mime: String(rows[0].audio_mime ?? "audio/mpeg") } : null;
}

/** Creates or replaces a playlist. Items the caller does not own are dropped. False when the id is someone else's. */
export async function putPlaylist(db: Db, profileId: string, p: Playlist): Promise<boolean> {
  const name = cleanTitle(p.name).slice(0, MAX_PLAYLIST_NAME) || "My playlist";
  const up = await db.query(
    `insert into playlist (id, profile_id, name, created_at, updated_at)
     values ($1, $2, $3, to_timestamp($4 / 1000.0), now())
     on conflict (id) do update set name = excluded.name, updated_at = now()
       where playlist.profile_id = excluded.profile_id
     returning id`,
    [p.id, profileId, name, p.createdAt],
  );
  if (!up.rows.length) return false;
  const wanted = [...new Set(p.itemIds.filter(isId))].slice(0, MAX_PLAYLIST_ITEMS);
  const owned = wanted.length
    ? new Set(
        (await db.query(`select id::text from manifestation where profile_id = $1 and id = any($2::uuid[])`, [profileId, wanted])).rows.map(
          (r) => String(r.id),
        ),
      )
    : new Set<string>();
  const ids = wanted.filter((id) => owned.has(id));
  await db.query(`delete from playlist_item where playlist_id = $1`, [p.id]);
  if (ids.length) {
    await db.query(
      `insert into playlist_item (playlist_id, manifestation_id, position)
       select $1, x.id, x.pos from unnest($2::uuid[]) with ordinality as x(id, pos)`,
      [p.id, ids],
    );
  }
  return true;
}

export async function deletePlaylist(db: Db, profileId: string, id: string): Promise<boolean> {
  const { rows } = await db.query(`delete from playlist where id = $1 and profile_id = $2 returning id`, [id, profileId]);
  return rows.length > 0;
}

/** Deletes the user and, by cascade, everything they own. Returns storage keys to delete. */
export async function deleteAccount(db: Db, userId: string): Promise<string[]> {
  // Every save takes this profile row's lock first (ensureProfile upserts it in
  // the same transaction), so holding it here means no save can commit a new
  // recording between reading the keys and deleting the rows.
  await db.query(`select id from profile where user_id = $1 for update`, [userId]);
  const keys = await db.query(
    `select r.audio_key from rendition r
       join manifestation m on m.id = r.manifestation_id
       join profile p on p.id = m.profile_id
      where p.user_id = $1 and r.audio_key is not null`,
    [userId],
  );
  await db.query(`delete from "user" where id = $1`, [userId]);
  return keys.rows.map((r) => String(r.audio_key));
}

/** Records storage keys to delete, in the caller's transaction. */
export async function addTombstones(db: Db, keys: string[]): Promise<void> {
  if (!keys.length) return;
  await db.query(`insert into blob_tombstone (key) select unnest($1::text[]) on conflict do nothing`, [keys]);
}

/**
 * Leftovers old enough to be safe to remove. A fresh tombstone may be a key a
 * save has reserved and is still uploading, so only those older than
 * `minAgeMinutes` are returned.
 */
export async function oldestTombstones(db: Db, limit = 50, minAgeMinutes = 10): Promise<string[]> {
  const { rows } = await db.query(
    `select key from blob_tombstone where created_at <= now() - make_interval(mins => $2) order by created_at limit $1`,
    [limit, minAgeMinutes],
  );
  return rows.map((r) => String(r.key));
}

export async function clearTombstones(db: Db, keys: string[]): Promise<void> {
  if (keys.length) await db.query(`delete from blob_tombstone where key = any($1::text[])`, [keys]);
}
