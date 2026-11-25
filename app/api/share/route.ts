import { NextResponse } from "next/server";
import { LIMITS, generationEnabled, underCeiling } from "@/lib/server/limits";
import { apiKey } from "@/lib/server/openrouter";
import { accountsEnabled, currentUser, type SignedIn } from "@/lib/server/accounts";
import { dbConfigured, getPool, withTx } from "@/lib/server/db";
import { createShare, listShares, MAX_LINKS_PER_DAY, releaseShareAttempt, reserveShareAttempt } from "@/lib/server/shareDb";
import { vetScript } from "@/lib/server/vet";
import { record } from "@/lib/server/ledger";
import { parseShare, type ShareInput, UUID } from "@/lib/share";
import { sameSiteRequest } from "@/lib/server/origin";

export const dynamic = "force-dynamic";

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
// manifestations, frozen from the copy saved in the account. The text model checks it first (the same check as
// re-recording): a public page on this domain must not carry text the model
// has not seen.
export async function POST(req: Request) {
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Wrong origin." }, { status: 403 });
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
  const parsed = parseShare(body);
  if (!parsed.ok) return NextResponse.json({ code: "bad_request", error: parsed.error }, { status: 400 });

  // The spend ceiling first: a refusal there uses none of the day's links.
  const budget = await underCeiling(key);
  if (!budget.ok) return NextResponse.json(budget.refusal, { status: budget.refusal.status });

  // Ownership and the daily cap are checked, and the attempt recorded, before
  // anything is spent on the content check. The copy shared is the one saved
  // in the account, never text from this request.
  let copy: ShareInput;
  let attemptId: string;
  try {
    const slot = await withTx((db) => reserveShareAttempt(db, user.id, parsed.manifestationId, LIMITS.maxScriptChars));
    if (!slot.ok) {
      if (slot.reason === "daily_limit") {
        return NextResponse.json({ code: "daily_limit", error: `You can make ${MAX_LINKS_PER_DAY} public links a day.` }, { status: 429 });
      }
      return slot.reason === "not_shareable"
        ? NextResponse.json({ code: "bad_request", error: slot.error }, { status: 400 })
        : NextResponse.json({ code: "not_found", error: "Save it in your account first." }, { status: 404 });
    }
    copy = slot.copy;
    attemptId = slot.attemptId;
  } catch {
    return NextResponse.json({ code: "db_failed", error: "The link could not be made just now." }, { status: 503 });
  }

  const vetted = [copy.title, ...copy.lines];
  const vet = await vetScript(key, vetted);
  // Every paid check goes in the spend ledger, as for re-recording; only a
  // check that never reached the model is left out.
  if (vet.ok || vet.reason !== "unavailable") {
    await record({ route: "share", kind: "vet", model: vet.model, chars: vetted.join(" ").length, estUsd: vet.costUsd });
  }
  if (!vet.ok && vet.reason === "unavailable") {
    // Nothing was spent, so the attempt is given back. If that fails, the
    // attempt simply counts; the caller still gets the same answer.
    await withTx((db) => releaseShareAttempt(db, user.id, attemptId)).catch(() => {});
  }
  if (!vet.ok) {
    return vet.reason === "rejected"
      ? NextResponse.json({ code: "not_shareable", error: "This one can't be shared publicly." }, { status: 422 })
      : NextResponse.json({ code: "vet_unavailable", error: "Sharing is paused for a moment." }, { status: 503 });
  }

  try {
    const out = await withTx((db) => createShare(db, user.id, copy));
    return out.ok
      ? NextResponse.json({ id: out.id }, { headers: { "Cache-Control": "no-store" } })
      : NextResponse.json({ code: "not_found", error: "It was deleted before the link was made." }, { status: 404 });
  } catch {
    return NextResponse.json({ code: "db_failed", error: "The link could not be made just now." }, { status: 503 });
  }
}
