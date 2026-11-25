import { NextResponse } from "next/server";
import { sameSiteRequest } from "@/lib/server/origin";
import { accountsEnabled, appleClients, appleLinks, currentUser, missingVars, purgeAudio, signInProviders, withTx } from "@/lib/server/accounts";
import { settleAppleRevocations, tryAddPendingRevocations } from "@/lib/server/appleRevokeDb";
import { type Db, getPool } from "@/lib/server/db";
import { type RevokeOutcome, collectAppleTokens, readAppleCode, revokeStoredToken } from "@/lib/server/appleRevoke";
import { addTombstones, deleteAccount } from "@/lib/server/libraryDb";

export const dynamic = "force-dynamic";
// Deleting an account can wait on Apple: a few calls, each with a five-second deadline (lib/server/appleRevoke.ts).
export const maxDuration = 60;

/** Whether accounts are on here, and who is signed in. */
export async function GET(req: Request) {
  const enabled = accountsEnabled();
  const user = enabled ? await currentUser(req).catch(() => null) : null;
  // Variable names only, never values, and only off production.
  const missing = !enabled && process.env.VERCEL_ENV !== "production" ? missingVars() : undefined;
  return NextResponse.json({ enabled, user, missing, providers: enabled ? signInProviders() : [] }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Deletes the signed-in account. One transaction removes every row (by
 * cascade) and records each recording's key for deletion; the recordings are
 * then removed from Blob, and any that fail are retried on later deletions.
 *
 * The Sign in with Apple grant is revoked too (App Review 5.1.1(v), #98): with the token the
 * website's sign-in stored, and with the fresh authorization code the iOS app sends as
 * `appleAuthorizationCode`. The tokens are gathered before the rows go and written to
 * apple_revocation_pending in the deleting transaction. Apple is called only after that commits,
 * and a token Apple does not accept stays recorded for a later deletion to retry. Deletion never
 * depends on Apple, nor on the retry table: if the tokens cannot be recorded, the account is still
 * deleted and Apple is tried once, without a retry. `apple` reports the result.
 *
 * The app's authorization code is single-use and is exchanged before the transaction, so that its
 * refresh token can be recorded with the delete. If the delete then fails, that code is spent and
 * nothing is revoked or stored, which is right: the account still exists. The app asks Apple for a
 * fresh code on every delete attempt (native/src/auth.ts, appleCodeForDeletion), so a retry works.
 */
export async function DELETE(req: Request) {
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Wrong origin." }, { status: 403 });
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const clients = appleClients();
  // Null when the Apple sign-ins could not be read: the deletion goes ahead and reports "failed".
  const found = await appleLinks(user.id)
    .then(async (links) => ({ links: links.length, ...(await collectAppleTokens({ links, code: readAppleCode(body), ...clients })) }))
    .catch(() => null);
  const { keys, pending } = await withTx(async (db) => {
    const keys = await deleteAccount(db, user.id);
    await addTombstones(db, keys);
    return { keys, pending: found ? await tryAddPendingRevocations(db, found.tokens) : [] };
  });
  let left: number;
  if (pending) {
    left = await settleAppleRevocations(getPool() as unknown as Db, clients, pending).catch(() => pending.length);
  } else {
    // The retry table could not be written (migration 003 not applied, perhaps). Try Apple once anyway.
    console.error("Account deletion: Apple revocations could not be recorded for retry.");
    left = 0;
    for (const t of found?.tokens ?? []) if (!(await revokeStoredToken(t, clients).catch(() => false))) left++;
  }
  const apple: RevokeOutcome = found?.links === 0 ? "nothing-to-revoke" : found && !found.unreachable && left === 0 ? "revoked" : "failed";
  // No ids or tokens in the log: only that a grant was left behind for a retry or for someone to follow up.
  if (apple === "failed") console.error("Account deletion: the Sign in with Apple grant could not be revoked.");
  const audioPending = await purgeAudio(keys);
  return NextResponse.json({ ok: true, audioPending, apple });
}
