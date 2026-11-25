import { NextResponse } from "next/server";
import { sameSiteRequest } from "@/lib/server/origin";
import { accountsEnabled, appleClients, appleLinks, currentUser, missingVars, purgeAudio, signInProviders, withTx } from "@/lib/server/accounts";
import { type AppleLink, type RevokeOutcome, readAppleCode, revokeAppleGrants } from "@/lib/server/appleRevoke";
import { addTombstones, deleteAccount } from "@/lib/server/libraryDb";

export const dynamic = "force-dynamic";

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
 * `appleAuthorizationCode`. The tokens are read before the rows go, but Apple is called only after
 * the deletion has committed, so a deletion that fails leaves the grant alone. Deletion never
 * depends on Apple; `apple` reports the result.
 */
export async function DELETE(req: Request) {
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Wrong origin." }, { status: 403 });
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const links = await appleLinks(user.id).catch(() => null);
  const keys = await withTx(async (db) => {
    const k = await deleteAccount(db, user.id);
    await addTombstones(db, k);
    return k;
  });
  const apple = await revokeApple(links, readAppleCode(body));
  const audioPending = await purgeAudio(keys);
  return NextResponse.json({ ok: true, audioPending, apple });
}

/** `links` is null when the account's Apple sign-ins could not be read before it was deleted. */
async function revokeApple(links: AppleLink[] | null, code: string | undefined): Promise<RevokeOutcome> {
  const outcome = links ? await revokeAppleGrants({ links, code, ...appleClients() }).catch(() => "failed" as const) : "failed";
  // No ids or tokens in the log: only that a grant was left behind for someone to follow up.
  if (outcome === "failed") console.error("Account deletion: the Sign in with Apple grant could not be revoked.");
  return outcome;
}
