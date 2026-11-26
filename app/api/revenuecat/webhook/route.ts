import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { grantPurchase, firstExistingUser } from "@/lib/server/creditsDb";
import { dbConfigured, withTx } from "@/lib/server/db";

export const dynamic = "force-dynamic";

// RevenueCat reports a purchase here; our server adds the credits (#168). RevenueCat only reports.
//
// Id mapping: RevenueCat's app user id is our account id, the Better Auth "user".id. The app calls
// Purchases.logIn(<that id>) right after sign-in and never buys while anonymous. If app_user_id is not an
// account (an anonymous id), the event's aliases are tried in order. No match: 200 and a log line, nothing granted.
//
// Auth: RevenueCat sends the Authorization header exactly as typed in its dashboard; it must equal
// REVENUECAT_WEBHOOK_AUTH. Not set: every call is refused.
//
// Repeats: the event id is the idempotency key (credit_ledger.source_id is unique). A repeated event, an
// ignored event type and an unknown product all answer 200 so RevenueCat stops retrying; only a server
// fault answers 5xx, so RevenueCat retries it.
const HANDLED = new Set(["NON_RENEWING_PURCHASE", "INITIAL_PURCHASE"]);

function sameSecret(got: string | null, want: string): boolean {
  if (!got) return false;
  // Hash both so the comparison is constant-time whatever their lengths.
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(got), h(want));
}

export async function POST(req: Request) {
  const want = process.env.REVENUECAT_WEBHOOK_AUTH?.trim();
  if (!want) return NextResponse.json({ code: "off", error: "Not set up." }, { status: 503 });
  if (!sameSecret(req.headers.get("authorization")?.trim() ?? null, want)) {
    return NextResponse.json({ code: "unauthorized", error: "Unauthorized." }, { status: 401 });
  }
  if (!dbConfigured()) return NextResponse.json({ code: "off", error: "Not set up." }, { status: 503 });

  let event: Record<string, unknown> | undefined;
  try {
    const body = (await req.json()) as { event?: Record<string, unknown> };
    event = body && typeof body === "object" && body.event && typeof body.event === "object" ? body.event : undefined;
  } catch {
    /* falls through to 400 */
  }
  if (!event) return NextResponse.json({ code: "bad_request", error: "Send a RevenueCat event." }, { status: 400 });

  const type = typeof event.type === "string" ? event.type : "";
  if (!HANDLED.has(type)) return NextResponse.json({ ok: true, status: "ignored", reason: "event_type" });

  const eventId = typeof event.id === "string" ? event.id.trim() : "";
  const productId = typeof event.product_id === "string" ? event.product_id : "";
  if (!eventId || eventId.length > 200) return NextResponse.json({ code: "bad_request", error: "No event id." }, { status: 400 });

  const ids = [event.app_user_id, ...(Array.isArray(event.aliases) ? event.aliases : [])].filter((i): i is string => typeof i === "string");
  try {
    const result = await withTx(async (db) => {
      const userId = await firstExistingUser(db, ids);
      if (!userId) return { status: "ignored" as const, reason: "unknown_user" };
      const environment = typeof event.environment === "string" ? event.environment : null;
      return { status: await grantPurchase(db, { userId, productId, eventId, environment }), userId };
    });
    if (result.status === "ignored" || result.status === "unknown_product") {
      // The purchase may be real and unmatched: leave a trail to fix by hand.
      console.warn("[revenuecat] not granted", JSON.stringify({ eventId, productId, why: "reason" in result ? result.reason : result.status }));
      return NextResponse.json({ ok: true, status: "ignored", reason: "reason" in result ? result.reason : "product" });
    }
    if (result.status === "already_owned") {
      console.warn("[revenuecat] starter bought twice, nothing added", JSON.stringify({ eventId, userId: result.userId }));
    }
    return NextResponse.json({ ok: true, status: result.status });
  } catch (e) {
    console.error("[revenuecat] grant failed", eventId, e instanceof Error ? e.message : e);
    return NextResponse.json({ code: "server_error", error: "Try again." }, { status: 500 });
  }
}
