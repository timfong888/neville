// Returns whether the signed-in user has adult-tier access.
// The native app calls this to decide whether to show adult-tier controls.
// A non-allowlisted user and a signed-out user both see { allowed: false } —
// the response is identical so callers cannot infer list membership from errors.
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/accounts";
import { isAdultTierUser } from "@/lib/adult/tier";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  try {
    const user = await currentUser(req);
    const allowed = isAdultTierUser(user?.email ?? null);
    return NextResponse.json({ allowed }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ allowed: false }, { headers: { "Cache-Control": "no-store" } });
  }
}
