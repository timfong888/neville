// Share links in Postgres (table share_link, migration 002). Every function
// takes a `Db` so tests can run them on PGlite. Only signed-in people make
// links; anyone can read one by id.
import "server-only";
import { randomBytes } from "node:crypto";
import type { Db } from "@/lib/server/libraryDb";
import { frozenCopy, type OwnLink, type PublicShare, SHARE_ID, type ShareInput, UUID } from "@/lib/share";

/** Share attempts one account may make in 24 hours. */
export const MAX_LINKS_PER_DAY = 20;

/** Locks the account's profile row if it owns the manifestation; false otherwise. */
async function ownsAndLock(db: Db, userId: string, manifestationId: string): Promise<boolean> {
  if (!UUID.test(manifestationId)) return false;
  const owns = await db.query(
    `select 1 from manifestation m join profile p on p.id = m.profile_id
      where p.user_id = $1 and m.id = $2::uuid for update of p`,
    [userId, manifestationId],
  );
  return owns.rows.length > 0;
}

export type ReserveResult =
  | { ok: true; copy: ShareInput; attemptId: string }
  | { ok: false; reason: "not_found" | "daily_limit" }
  | { ok: false; reason: "not_shareable"; error: string };

/**
 * Records one attempt to share, before the paid content check runs, and
 * returns the copy to freeze: the title and script saved in the account (the
 * newest rendition), never text from the request. Refuses a manifestation the
 * account does not own, one whose saved copy cannot be shared (no attempt is
 * used), and a 21st attempt in 24 hours. Attempts count whatever the check
 * decides (rejected, or made and later revoked), so an over-quota caller
 * cannot keep spending on moderation; only a check that never reached the
 * model gives its attempt back (releaseShareAttempt). Runs under a lock on the account's profile row, so
 * parallel requests cannot pass the cap together. Run inside a transaction.
 */
export async function reserveShareAttempt(db: Db, userId: string, manifestationId: string, maxChars: number): Promise<ReserveResult> {
  if (!(await ownsAndLock(db, userId, manifestationId))) return { ok: false, reason: "not_found" };
  const saved = await db.query(
    `select m.title, r.script, r.voice_name, r.audio_key
       from manifestation m
       left join lateral (select * from rendition where manifestation_id = m.id order by created_at desc limit 1) r on true
      where m.id = $1::uuid`,
    [manifestationId],
  );
  const row = saved.rows[0] ?? {};
  // A voice is named only when there is a recording in it, as in the app.
  const copy = frozenCopy({ title: row.title, lines: row.script, voiceName: row.audio_key ? row.voice_name : "" }, maxChars);
  if (!copy.ok) return { ok: false, reason: "not_shareable", error: copy.error };
  await db.query(`delete from share_attempt where user_id = $1 and created_at <= now() - interval '24 hours'`, [userId]);
  const made = await db.query(`select count(*)::int as n from share_attempt where user_id = $1`, [userId]);
  if (Number(made.rows[0]?.n ?? 0) >= MAX_LINKS_PER_DAY) return { ok: false, reason: "daily_limit" };
  const slot = await db.query(`insert into share_attempt (user_id) values ($1) returning id`, [userId]);
  return {
    ok: true,
    copy: { manifestationId, title: copy.title, lines: copy.lines, voiceName: copy.voiceName },
    attemptId: String(slot.rows[0].id),
  };
}

/** Gives back an attempt whose content check never reached the model, so an outage does not use up the day's links. */
export async function releaseShareAttempt(db: Db, userId: string, attemptId: string): Promise<void> {
  await db.query(`delete from share_attempt where id = $1::bigint and user_id = $2`, [attemptId, userId]);
}

export type CreateResult = { ok: true; id: string } | { ok: false; reason: "not_found" };

/**
 * Makes a link to one of `userId`'s saved manifestations, freezing the copy
 * reserveShareAttempt returned and the content check passed.
 * Re-checks ownership: the manifestation may have been deleted meanwhile.
 * Run inside a transaction.
 */
export async function createShare(db: Db, userId: string, input: ShareInput): Promise<CreateResult> {
  if (!(await ownsAndLock(db, userId, input.manifestationId))) return { ok: false, reason: "not_found" };
  const id = randomBytes(16).toString("base64url"); // 22 characters
  await db.query(
    `insert into share_link (id, user_id, manifestation_id, title, lines, voice_name)
     values ($1, $2, $3::uuid, $4, $5::jsonb, $6)`,
    [id, userId, input.manifestationId, input.title, JSON.stringify(input.lines), input.voiceName],
  );
  return { ok: true, id };
}

export async function getShare(db: Db, id: string): Promise<PublicShare | null> {
  if (!SHARE_ID.test(id)) return null;
  const { rows } = await db.query("select id, title, lines, voice_name, created_at from share_link where id = $1", [id]);
  const r = rows[0] as { id: string; title: string; lines: unknown; voice_name: string; created_at: Date | string } | undefined;
  if (!r) return null;
  const lines = Array.isArray(r.lines) ? r.lines.filter((l): l is string => typeof l === "string") : [];
  return { id: r.id, title: r.title, lines, voiceName: r.voice_name, createdAt: new Date(r.created_at).getTime() };
}

/** The account's live links to one manifestation, newest first: what its panel shows on any device. */
export async function listShares(db: Db, userId: string, manifestationId: string): Promise<OwnLink[]> {
  if (!UUID.test(manifestationId)) return [];
  const { rows } = await db.query(
    `select id, created_at from share_link where user_id = $1 and manifestation_id = $2::uuid order by created_at desc`,
    [userId, manifestationId],
  );
  return rows.map((r) => ({ id: String(r.id), createdAt: new Date(r.created_at as string).getTime() }));
}

/** Revokes (deletes) a link, only for the account that made it. False when nothing matched, without saying which. */
export async function revokeShare(db: Db, userId: string, id: string): Promise<boolean> {
  if (!SHARE_ID.test(id)) return false;
  const { rows } = await db.query("delete from share_link where id = $1 and user_id = $2 returning id", [id, userId]);
  return rows.length > 0;
}
