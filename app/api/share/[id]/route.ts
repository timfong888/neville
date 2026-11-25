import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/accounts";
import { dbConfigured, getPool } from "@/lib/server/db";
import { revokeShare } from "@/lib/server/shareDb";
import { sameSiteRequest } from "@/lib/server/origin";

export const dynamic = "force-dynamic";

// Revokes a link, for the signed-in account that made it, from any device.
// Deleting the row is the revocation; the public page is a 404 from then on.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Wrong origin." }, { status: 403 });
  if (!dbConfigured()) {
    return NextResponse.json({ code: "off", error: "Public links are not switched on." }, { status: 503 });
  }
  let user: Awaited<ReturnType<typeof currentUser>>;
  try {
    user = await currentUser(req);
  } catch {
    return NextResponse.json({ error: "Could not check your sign-in just now." }, { status: 503 });
  }
  if (!user) return NextResponse.json({ code: "sign_in", error: "Sign in to manage your links." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    // Already gone and not yours look the same, so ids cannot be probed.
    return (await revokeShare(getPool(), user.id, id))
      ? NextResponse.json({ revoked: true })
      : NextResponse.json({ error: "No such link, or not yours." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Could not revoke just now." }, { status: 503 });
  }
}
