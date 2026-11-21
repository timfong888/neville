import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/accounts";
import { dbConfigured, getPool } from "@/lib/server/db";
import { revokeShare } from "@/lib/server/shareDb";
import { OWNER_TOKEN } from "@/lib/share";

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
