import { NextResponse } from "next/server";
import { LIMITS, underCeiling } from "@/lib/server/limits";
import { apiKey } from "@/lib/server/openrouter";
import { currentUser } from "@/lib/server/accounts";
import { dbConfigured, getPool } from "@/lib/server/db";
import { createShare, revokeSharesOf } from "@/lib/server/shareDb";
import { vetScript } from "@/lib/server/vet";
import { MANIFESTATION_ID, parseShare } from "@/lib/share";

export const dynamic = "force-dynamic";

// Soft per-visitor limit, in memory like the recording counters (issue #8).
const PER_IP_PER_DAY = 20;
let day = "";
const made = new Map<string, number>();
function allow(ip: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    made.clear();
  }
  const n = made.get(ip) ?? 0;
  if (n >= PER_IP_PER_DAY) return false;
  if (made.size > 5000) made.clear();
  made.set(ip, n + 1);
  return true;
}

function visitor(req: Request): string {
  return req.headers.get("x-real-ip")?.trim() || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Whether sharing is switched on here, for the page to decide what to show. */
export async function GET() {
  return NextResponse.json({ enabled: dbConfigured() && !!apiKey() });
}

// Makes a public, read-only copy of a title and script. The text model checks
// it first (the same check as re-recording): a public page on this domain
// must not carry text the model has not seen.
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) {
    return NextResponse.json({ error: "Wrong origin." }, { status: 403 });
  }
  const key = apiKey();
  if (!dbConfigured() || !key) {
    return NextResponse.json({ code: "off", error: "Public links are not switched on yet." }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "bad_request", error: "Send JSON." }, { status: 400 });
  }
  const parsed = parseShare(body, LIMITS.maxScriptChars);
  if (!parsed.ok) return NextResponse.json({ code: "bad_request", error: parsed.error }, { status: 400 });
  if (!allow(visitor(req))) {
    return NextResponse.json({ code: "visitor_full", error: "You have made today's public links." }, { status: 429 });
  }
  const budget = await underCeiling(key);
  if (!budget.ok) return NextResponse.json(budget.refusal, { status: budget.refusal.status });

  const vet = await vetScript(key, [parsed.value.title, ...parsed.value.lines]);
  if (!vet.ok) {
    return vet.reason === "rejected"
      ? NextResponse.json({ code: "not_shareable", error: "This one can't be shared publicly." }, { status: 422 })
      : NextResponse.json({ code: "vet_unavailable", error: "Sharing is paused for a moment." }, { status: 503 });
  }

  const user = await currentUser(req).catch(() => null);
  try {
    const out = await createShare(getPool(), parsed.value, user?.id ?? null);
    return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ code: "db_failed", error: "The link could not be made just now." }, { status: 503 });
  }
}

// Revokes the signed-in user's links to one manifestation (called when it is
// deleted), so a link made on another device stops working too.
export async function DELETE(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) {
    return NextResponse.json({ error: "Wrong origin." }, { status: 403 });
  }
  const mid = new URL(req.url).searchParams.get("manifestation") ?? "";
  if (!MANIFESTATION_ID.test(mid)) return NextResponse.json({ error: "Which manifestation?" }, { status: 400 });
  if (!dbConfigured()) return NextResponse.json({ revoked: 0 });
  // A failed session lookup is not "signed out": answering 200 would let the
  // manifestation be deleted while the account's links elsewhere stay public.
  let user: Awaited<ReturnType<typeof currentUser>>;
  try {
    user = await currentUser(req);
  } catch {
    return NextResponse.json({ error: "Could not check your sign-in just now." }, { status: 503 });
  }
  if (!user) return NextResponse.json({ revoked: 0 });
  try {
    return NextResponse.json({ revoked: await revokeSharesOf(getPool(), user.id, mid) });
  } catch {
    return NextResponse.json({ error: "Could not revoke just now." }, { status: 503 });
  }
}
