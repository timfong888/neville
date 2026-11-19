import { NextResponse } from "next/server";
import { accountsEnabled, currentUser, deleteAudio, missingVars, withTx } from "@/lib/server/accounts";
import { deleteAccount } from "@/lib/server/libraryDb";

export const dynamic = "force-dynamic";

/** Whether accounts are on here, and who is signed in. */
export async function GET(req: Request) {
  const enabled = accountsEnabled();
  const user = enabled ? await currentUser(req).catch(() => null) : null;
  // Variable names only, never values, and only off production.
  const missing = !enabled && process.env.VERCEL_ENV !== "production" ? missingVars() : undefined;
  return NextResponse.json({ enabled, user, missing }, { headers: { "Cache-Control": "no-store" } });
}

/** Deletes the signed-in account: rows by cascade in one transaction, then the recordings. */
export async function DELETE(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Wrong origin." }, { status: 403 });
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const keys = await withTx((db) => deleteAccount(db, user.id));
  await deleteAudio(keys);
  return NextResponse.json({ ok: true });
}
