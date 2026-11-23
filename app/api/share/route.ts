import { NextResponse } from "next/server";
import { LIMITS, generationEnabled, underCeiling } from "@/lib/server/limits";
import { apiKey } from "@/lib/server/openrouter";
import { accountsEnabled, currentUser, type SignedIn } from "@/lib/server/accounts";
import { dbConfigured, getPool, withTx } from "@/lib/server/db";
import { createShare, listShares, MAX_LINKS_PER_DAY, reserveShareAttempt } from "@/lib/server/shareDb";
import { vetScript } from "@/lib/server/vet";
import { record } from "@/lib/server/ledger";
import { parseShare, UUID } from "@/lib/share";

export const dynamic = "force-dynamic";

const wrongOrigin = (req: Request) => {
  const origin = req.headers.get("origin");
  return !!origin && origin !== new URL(req.url).origin;
};

/**
 * Managing links (listing and revoking your own) needs the database and
 * sign-in. Making a new one also needs the text model for the content check,
 * and stops with the generation kill switch (SPEECH_ENABLED=false), which
 * halts every paid model call. The switch never hides existing links or the
 * means to revoke them.
 */
const linksOn = () => dbConfigured() && accountsEnabled();
const canCreate = () => linksOn() && generationEnabled() && !!apiKey();

/** The signed-in user, null when signed out, or "unavailable" when the lookup failed. */
async function who(req: Request): Promise<SignedIn | null | "unavailable"> {
  try {
    return await currentUser(req);
  } catch {
    return "unavailable";
  }
}

// GET: whether links are on here (`enabled`) and whether new ones can be made
// right now (`canCreate`). With ?manifestation=<id>, also the signed-in
// account's live links to it, so its panel shows them, and can revoke them, on
// any device, even while making new links is paused.
export async function GET(req: Request) {
  const enabled = linksOn();
  const create = canCreate();
  const mid = new URL(req.url).searchParams.get("manifestation");
  if (!enabled || mid === null) return NextResponse.json({ enabled, canCreate: create, links: [] });
  if (!UUID.test(mid)) return NextResponse.json({ error: "Which manifestation?" }, { status: 400 });
  const user = await who(req);
  if (user === "unavailable") return NextResponse.json({ error: "Could not check your sign-in just now." }, { status: 503 });
  if (!user) return NextResponse.json({ enabled, canCreate: create, signedIn: false, links: [] });
  try {
    const links = await listShares(getPool(), user.id, mid);
    return NextResponse.json({ enabled, canCreate: create, signedIn: true, links }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load your links just now." }, { status: 503 });
  }
}

// Makes a public, read-only copy of one of the signed-in account's saved
// manifestations. The text model checks it first (the same check as
// re-recording): a public page on this domain must not carry text the model
// has not seen.
export async function POST(req: Request) {
  if (wrongOrigin(req)) return NextResponse.json({ error: "Wrong origin." }, { status: 403 });
  const key = apiKey();
  if (!canCreate() || !key) {
    return NextResponse.json({ code: "off", error: "Public links are not switched on yet." }, { status: 503 });
  }
  const user = await who(req);
  if (user === "unavailable") {
    return NextResponse.json({ code: "session_unavailable", error: "Could not check your sign-in just now." }, { status: 503 });
  }
  if (!user) return NextResponse.json({ code: "sign_in", error: "Sign in to share." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "bad_request", error: "Send JSON." }, { status: 400 });
  }
  const parsed = parseShare(body, LIMITS.maxScriptChars);
  if (!parsed.ok) return NextResponse.json({ code: "bad_request", error: parsed.error }, { status: 400 });

  // Ownership and the daily cap are checked, and the attempt recorded,
  // before anything is spent on the content check.
  try {
    const slot = await withTx((db) => reserveShareAttempt(db, user.id, parsed.value.manifestationId));
    if (!slot.ok) {
      return slot.reason === "daily_limit"
        ? NextResponse.json({ code: "daily_limit", error: `You can make ${MAX_LINKS_PER_DAY} public links a day.` }, { status: 429 })
        : NextResponse.json({ code: "not_found", error: "Save it in your account first." }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ code: "db_failed", error: "The link could not be made just now." }, { status: 503 });
  }

  const budget = await underCeiling(key);
  if (!budget.ok) return NextResponse.json(budget.refusal, { status: budget.refusal.status });

  const vetted = [parsed.value.title, ...parsed.value.lines];
  const vet = await vetScript(key, vetted);
  // Every paid check goes in the spend ledger, as for re-recording; only a
  // check that never reached the model is left out.
  if (vet.ok || vet.reason !== "unavailable") {
    await record({ route: "share", kind: "vet", model: vet.model, chars: vetted.join(" ").length, estUsd: vet.costUsd });
  }
  if (!vet.ok) {
    return vet.reason === "rejected"
      ? NextResponse.json({ code: "not_shareable", error: "This one can't be shared publicly." }, { status: 422 })
      : NextResponse.json({ code: "vet_unavailable", error: "Sharing is paused for a moment." }, { status: 503 });
  }

  try {
    const out = await withTx((db) => createShare(db, user.id, parsed.value));
    return out.ok
      ? NextResponse.json({ id: out.id }, { headers: { "Cache-Control": "no-store" } })
      : NextResponse.json({ code: "not_found", error: "It was deleted before the link was made." }, { status: 404 });
  } catch {
    return NextResponse.json({ code: "db_failed", error: "The link could not be made just now." }, { status: 503 });
  }
}
