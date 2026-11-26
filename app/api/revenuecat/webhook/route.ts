import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { grantPurchase, firstExistingUser } from "@/lib/server/creditsDb";
import { dbConfigured, withTx } from "@/lib/server/db";

export const dynamic = "force-dynamic";

// RevenueCat reports a purchase here; our server adds the credits (#168). RevenueCat only reports.
//
// Id mapping: RevenueCat's app user id is our account id, the Better Auth "user".id. The app calls
// Purchases.logIn(<that id>) right after sign-in and never buys while anonymous. If app_user_id is not an
// account (an anonymous id), the event's aliases are tried in order. No match: 503 so RevenueCat retries (the
// account may not exist yet), with one log line per event id; nothing is granted.
//
// Auth: RevenueCat sends the Authorization header exactly as typed in its dashboard; it must equal
// REVENUECAT_WEBHOOK_AUTH. Not set: every call is refused.
//
// Repeats: the store transaction id is the idempotency key (credit_ledger.source_id is unique), so a
// redelivered event and a restored purchase under a new event id never grant twice. An event with no
// transaction id falls back to its event id. Starter is a non-consumable, so the store allows one
// purchase per Apple ID; the once-per-account check in grantPurchase is the second guard. A repeated event, an
// ignored event type and an unknown product answer 200 so RevenueCat stops retrying; a server fault and an unknown
// user answer 5xx, so RevenueCat retries them.
// Event ids already logged as "unknown user" by this server instance, so retries do not repeat the line (best effort, per instance).
const loggedUnknown = new Set<string>();
function logUnknownUser(eventId: string, productId: string) {
  if (loggedUnknown.has(eventId)) return;
  if (loggedUnknown.size >= 500) loggedUnknown.clear();
  loggedUnknown.add(eventId);
  console.warn("[revenuecat] unknown user, will be retried", JSON.stringify({ eventId, productId }));
}

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

  // The store's transaction id when the event has one: the same purchase keeps one key whatever event reports it.
  const txn = typeof event.transaction_id === "string" ? event.transaction_id.trim() : "";
  const key = txn && txn.length <= 200 ? `txn:${txn}` : eventId;

  // Sandbox purchases are free, so they are accepted only while REVENUECAT_ACCEPT_SANDBOX=true (a TestFlight test), never by default.
  const environment = typeof event.environment === "string" ? event.environment : null;
  if (environment === "SANDBOX" && process.env.REVENUECAT_ACCEPT_SANDBOX?.trim().toLowerCase() !== "true") {
    return NextResponse.json({ ok: true, status: "ignored", reason: "sandbox" });
  }

  const ids = [event.app_user_id, ...(Array.isArray(event.aliases) ? event.aliases : [])].filter((i): i is string => typeof i === "string");
  try {
    const result = await withTx(async (db) => {
      const userId = await firstExistingUser(db, ids);
      if (!userId) return { status: "ignored" as const, reason: "unknown_user" };
      return { status: await grantPurchase(db, { userId, productId, eventId: key, environment }), userId };
    });
    if (result.status === "ignored") {
      // A purchase with no account yet: 5xx so RevenueCat retries it, in case the account is created first.
      logUnknownUser(eventId, productId);
      return NextResponse.json({ code: "unknown_user", error: "No account for this purchase yet." }, { status: 503 });
    }
    if (result.status === "unknown_product") {
      console.warn("[revenuecat] product not sold, ignored", JSON.stringify({ eventId, productId }));
      return NextResponse.json({ ok: true, status: "ignored", reason: "product" });
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
