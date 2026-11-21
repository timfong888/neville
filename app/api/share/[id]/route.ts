import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/accounts";
import { dbConfigured, getPool } from "@/lib/server/db";
import { claimShare, revokeShare } from "@/lib/server/shareDb";
import { MANIFESTATION_ID, OWNER_TOKEN } from "@/lib/share";

export const dynamic = "force-dynamic";

// Revokes a share: the owner token from the device that made it, or the
// signed-in account that made it. Deleting the row is the revocation; the
// public page is a 404 from then on.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) {
    return NextResponse.json({ error: "Wrong origin." }, { status: 403 });
  }
  // With links switched off nothing can be deleted, so this is not a revoke:
  // the row may come back with the database. The client keeps the token and
  // retries; meanwhile no public page can be served.
  if (!dbConfigured()) {
    return NextResponse.json({ code: "links_off", error: "Public links are not switched on." }, { status: 503 });
  }
  const { id } = await ctx.params;
  const t = req.headers.get("x-owner-token")?.trim() ?? "";
  const token = OWNER_TOKEN.test(t) ? t : null;
  const user = await currentUser(req).catch(() => null);
  if (!token && !user) return NextResponse.json({ error: "Not yours to revoke." }, { status: 403 });
  try {
    const ok = await revokeShare(getPool(), id, token, user?.id ?? null);
    // Already gone and not yours look the same, so ids cannot be probed.
    return ok
      ? NextResponse.json({ revoked: true })
      : NextResponse.json({ error: "No such link, or not yours." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Could not revoke just now." }, { status: 503 });
  }
}

// Claims a link made signed out for the signed-in account (owner token as
// proof), optionally re-pointing it at the item's id in the account. Called
// when device work moves into the account, so deleting it there, or deleting
// the account, also takes the link down.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) {
    return NextResponse.json({ error: "Wrong origin." }, { status: 403 });
  }
  if (!dbConfigured()) {
    return NextResponse.json({ code: "links_off", error: "Public links are not switched on." }, { status: 503 });
  }
  const { id } = await ctx.params;
  const t = req.headers.get("x-owner-token")?.trim() ?? "";
  if (!OWNER_TOKEN.test(t)) return NextResponse.json({ error: "Not yours." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { manifestationId?: unknown } | null;
  const mid = typeof body?.manifestationId === "string" && MANIFESTATION_ID.test(body.manifestationId) ? body.manifestationId : null;
  let user: Awaited<ReturnType<typeof currentUser>>;
  try {
    user = await currentUser(req);
  } catch {
    return NextResponse.json({ error: "Could not check your sign-in just now." }, { status: 503 });
  }
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    return (await claimShare(getPool(), id, t, user.id, mid))
      ? NextResponse.json({ claimed: true })
      : NextResponse.json({ error: "No such link, or not yours." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Could not update the link just now." }, { status: 503 });
  }
}
