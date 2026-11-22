// Shared guard for the /api/library routes: accounts on, signed in, profile known.
import "server-only";
import { NextResponse } from "next/server";
import { currentUser, withTx } from "@/lib/server/accounts";
import { type Db, ensureProfile } from "@/lib/server/libraryDb";

export async function asOwner(
  req: Request,
  fn: (db: Db, profileId: string) => Promise<Response>,
): Promise<Response> {
  // State-changing requests must come from this site's own pages.
  if (req.method !== "GET") {
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(req.url).origin) {
      return NextResponse.json({ error: "Wrong origin." }, { status: 403 });
    }
  }
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return withTx(async (db) => fn(db, await ensureProfile(db, user.id)));
}
