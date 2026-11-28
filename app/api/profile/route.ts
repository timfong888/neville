import { NextResponse } from "next/server";
import { sameSiteRequest } from "@/lib/server/origin";
import { accountsEnabled, currentUser } from "@/lib/server/accounts";
import { ensureProfile } from "@/lib/server/libraryDb";
import { getPool } from "@/lib/server/db";
import { validateFirstName } from "@/lib/firstName";

export const dynamic = "force-dynamic";

/** Returns the signed-in user's profile: firstName and plan. Null user → 401. */
export async function GET(req: Request) {
  if (!accountsEnabled()) return NextResponse.json({ firstName: "", plan: "free" });
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const db = getPool();
  const profileId = await ensureProfile(db as never, user.id);
  const { rows } = await db.query(`select first_name, plan from profile where id = $1`, [profileId]);
  const row = rows[0] ?? {};
  return NextResponse.json(
    { firstName: String(row.first_name ?? ""), plan: String(row.plan ?? "free") },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Updates firstName. Body: { firstName: string }. Returns updated value. */
export async function PATCH(req: Request) {
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Wrong origin." }, { status: 403 });
  if (!accountsEnabled()) return NextResponse.json({ error: "Accounts not enabled." }, { status: 503 });
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const raw = typeof body?.firstName === "string" ? body.firstName.trim() : null;
  if (raw === null) return NextResponse.json({ error: "firstName is required." }, { status: 400 });
  const err = validateFirstName(raw);
  if (err) return NextResponse.json({ error: err }, { status: 422 });
  const db = getPool();
  const profileId = await ensureProfile(db as never, user.id);
  await db.query(`update profile set first_name = $1 where id = $2`, [raw || null, profileId]);
  return NextResponse.json({ firstName: raw });
}
