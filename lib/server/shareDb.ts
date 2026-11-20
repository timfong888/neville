// Share links in Postgres (table share_link, migration 002). Every function
// takes a `Db` so tests can run them on PGlite.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "@/lib/server/libraryDb";
import { type PublicShare, SHARE_ID, type ShareInput } from "@/lib/share";

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Creates a share. Returns the id and the owner token; the token is never stored, only its hash. */
export async function createShare(
  db: Db,
  input: ShareInput,
  userId: string | null,
): Promise<{ id: string; ownerToken: string }> {
  const id = randomBytes(16).toString("base64url"); // 22 characters
  const ownerToken = randomBytes(32).toString("base64url"); // 43 characters
  await db.query(
    "insert into share_link (id, owner_token_hash, user_id, title, lines, voice_name, manifestation_id) values ($1, $2, $3, $4, $5::jsonb, $6, $7)",
    [id, hashToken(ownerToken), userId, input.title, JSON.stringify(input.lines), input.voiceName, input.manifestationId],
  );
  return { id, ownerToken };
}

export async function getShare(db: Db, id: string): Promise<PublicShare | null> {
  if (!SHARE_ID.test(id)) return null;
  const { rows } = await db.query(
    "select id, title, lines, voice_name, created_at from share_link where id = $1",
    [id],
  );
  const r = rows[0] as { id: string; title: string; lines: unknown; voice_name: string; created_at: Date | string } | undefined;
  if (!r) return null;
  const lines = Array.isArray(r.lines) ? r.lines.filter((l): l is string => typeof l === "string") : [];
  return { id: r.id, title: r.title, lines, voiceName: r.voice_name, createdAt: new Date(r.created_at).getTime() };
}

/**
 * Revokes (deletes) a share. Allowed with the owner token, or for the signed-in
 * user who made it. Returns false when nothing matched, without saying which.
 */
export async function revokeShare(db: Db, id: string, ownerToken: string | null, userId: string | null): Promise<boolean> {
  if (!SHARE_ID.test(id)) return false;
  const { rows } = await db.query(
    "delete from share_link where id = $1 and (($2::text is not null and owner_token_hash = $2) or ($3::text is not null and user_id = $3)) returning id",
    [id, ownerToken ? hashToken(ownerToken) : null, userId],
  );
  return rows.length > 0;
}

/** Revokes every link a signed-in user made of one manifestation, from any device. Returns how many. */
export async function revokeSharesOf(db: Db, userId: string, manifestationId: string): Promise<number> {
  const { rows } = await db.query(
    "delete from share_link where user_id = $1 and manifestation_id = $2 returning id",
    [userId, manifestationId],
  );
  return rows.length;
}
