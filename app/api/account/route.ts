import { NextResponse } from "next/server";
import { sameSiteRequest } from "@/lib/server/origin";
import { accountsEnabled, currentUser, missingVars, purgeAudio, withTx } from "@/lib/server/accounts";
import { addTombstones, deleteAccount } from "@/lib/server/libraryDb";

export const dynamic = "force-dynamic";

/** Whether accounts are on here, and who is signed in. */
export async function GET(req: Request) {
  const enabled = accountsEnabled();
  const user = enabled ? await currentUser(req).catch(() => null) : null;
  // Variable names only, never values, and only off production.
  const missing = !enabled && process.env.VERCEL_ENV !== "production" ? missingVars() : undefined;
  return NextResponse.json({ enabled, user, missing }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Deletes the signed-in account. One transaction removes every row (by
 * cascade) and records each recording's key for deletion; the recordings are
 * then removed from Blob, and any that fail are retried on later deletions.
 */
export async function DELETE(req: Request) {
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Wrong origin." }, { status: 403 });
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const keys = await withTx(async (db) => {
    const k = await deleteAccount(db, user.id);
    await addTombstones(db, k);
    return k;
  });
  const audioPending = await purgeAudio(keys);
  return NextResponse.json({ ok: true, audioPending });
}
