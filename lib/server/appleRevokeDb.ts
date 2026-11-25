// The retry record for Sign in with Apple revocations (#98): table apple_revocation_pending.
// Takes any client with `query(text, params)`, so tests run on PGlite.
import type { AppleClient, RevocableToken } from "@/lib/server/appleRevoke";
import { revokeStoredToken } from "@/lib/server/appleRevoke";
import type { Db } from "@/lib/server/libraryDb";

/** How many older rows one account deletion retries, so a long backlog never slows a request much. */
export const RETRY_BATCH = 5;

/**
 * Once this much time has gone on Apple calls in one request, older rows wait for the next deletion.
 * Each call has its own five-second deadline, so a dead Apple could otherwise hold the response for
 * that long per row. The rows of the account just deleted are always tried.
 */
export const RETRY_BUDGET_MS = 8000;

type Row = RevocableToken & { id: string };

/** Records tokens to revoke. Call it in the transaction that deletes the account. Returns the new row ids. */
export async function addPendingRevocations(db: Db, tokens: RevocableToken[]): Promise<string[]> {
  const ids: string[] = [];
  for (const t of tokens) {
    const { rows } = await db.query(`insert into apple_revocation_pending (client_id, token, token_hint) values ($1, $2, $3) returning id::text`, [t.clientId, t.token, t.hint]);
    ids.push(String(rows[0].id));
  }
  return ids;
}

async function pending(db: Db, where: string, params: unknown[]): Promise<Row[]> {
  const { rows } = await db.query(`select id::text, client_id, token, token_hint from apple_revocation_pending ${where}`, params);
  return rows.map((r) => ({ id: String(r.id), clientId: String(r.client_id), token: String(r.token), hint: r.token_hint as Row["hint"] }));
}

/**
 * Tries Apple for the rows in `mine` (the account just deleted) and for up to RETRY_BATCH older rows
 * left by earlier failures. A row Apple accepts is removed; any other stays, with its attempt counted,
 * for a later deletion to retry. Returns how many of `mine` are still pending.
 */
export async function settleAppleRevocations(
  db: Db,
  clients: { web?: AppleClient | null; app?: AppleClient | null },
  mine: string[],
  doFetch: typeof fetch = fetch,
  clock: () => number = Date.now,
): Promise<number> {
  const started = clock();
  const rows = [
    ...(mine.length ? await pending(db, `where id = any($1::bigint[])`, [mine]) : []),
    ...(await pending(db, `where not (id = any($1::bigint[])) order by last_tried_at nulls first, id limit $2`, [mine, RETRY_BATCH])),
  ];
  let left = 0;
  for (const r of rows) {
    if (!mine.includes(r.id) && clock() - started > RETRY_BUDGET_MS) break;
    if (await revokeStoredToken(r, clients, doFetch)) {
      await db.query(`delete from apple_revocation_pending where id = $1`, [r.id]);
    } else {
      await db.query(`update apple_revocation_pending set attempts = attempts + 1, last_tried_at = now() where id = $1`, [r.id]);
      if (mine.includes(r.id)) left++;
    }
  }
  return left;
}
