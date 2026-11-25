import { NextResponse } from "next/server";
import { sameSiteRequest } from "@/lib/server/origin";
import { accountsEnabled, appleClients, appleLinks, currentUser, missingVars, purgeAudio, signInProviders, withTx } from "@/lib/server/accounts";
import { type RevokeOutcome, readAppleCode, revokeAppleGrants } from "@/lib/server/appleRevoke";
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
 * Before the rows go, the Sign in with Apple grant is revoked (App Review 5.1.1(v), #98): with the
 * token the website's sign-in stored, and with the fresh authorization code the iOS app sends as
 * `appleAuthorizationCode`. Deletion goes ahead whatever Apple answers; `apple` reports the result.
 */
export async function DELETE(req: Request) {
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Wrong origin." }, { status: 403 });
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const apple = await revokeApple(user.id, readAppleCode(body));
  const keys = await withTx(async (db) => {
    const k = await deleteAccount(db, user.id);
    await addTombstones(db, k);
    return k;
  });
  const audioPending = await purgeAudio(keys);
  return NextResponse.json({ ok: true, audioPending, apple });
}

async function revokeApple(userId: string, code: string | undefined): Promise<RevokeOutcome> {
  try {
    const outcome = await revokeAppleGrants({ links: await appleLinks(userId), code, ...appleClients() });
    // No ids or tokens in the log: only that a grant was left behind for someone to follow up.
    if (outcome === "failed") console.error("Account deletion: the Sign in with Apple grant could not be revoked.");
    return outcome;
  } catch {
    console.error("Account deletion: the Sign in with Apple grant could not be looked up.");
    return "failed";
  }
}
