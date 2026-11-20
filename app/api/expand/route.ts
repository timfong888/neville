import { NextResponse } from "next/server";
import { apiKey } from "@/lib/server/openrouter";
import { LIMITS, generationEnabled, returnExpandSlot, takeExpandSlot, underCeiling } from "@/lib/server/limits";
import { expandWish } from "@/lib/server/expander";
import { vetScript } from "@/lib/server/vet";
import { record } from "@/lib/server/ledger";
import { allLines, holdsAudio, reviewFlags, wishNote } from "@/lib/expand";
import { resolveTone } from "@/lib/delivery";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function visitor(req: Request): string {
  return (
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function lines(v: unknown): string[] | null {
  if (!Array.isArray(v) || !v.every((l) => typeof l === "string")) return null;
  const out = (v as string[]).map((l) => l.replace(/\s+/g, " ").trim().slice(0, 300)).filter(Boolean);
  return out.length && out.length <= 20 ? out : null;
}

// Step one of two: the wish in, a fuller script out, as text. No audio is made
// and no voice is paid for here; the person reads and edits the words, then
// /api/rerecord records them. The text model's own output is vetted before it
// is shown, and vetted again when it is recorded. Nothing is stored.
export async function POST(req: Request) {
  if (!generationEnabled()) {
    return NextResponse.json({ code: "off", error: "Drafting is switched off." }, { status: 503 });
  }
  const key = apiKey();
  if (!key) return NextResponse.json({ code: "off", error: "Drafting is not set up here." }, { status: 503 });

  let body: { want?: unknown; name?: unknown; tone?: unknown; richer?: unknown; draft?: unknown; regenerations?: unknown };
  try {
    body = await req.json();
    if (!body || typeof body !== "object") throw new Error("not an object");
  } catch {
    return NextResponse.json({ code: "bad_request", error: "Send JSON." }, { status: 400 });
  }
  const want = typeof body.want === "string" ? body.want.replace(/\s+/g, " ").trim() : "";
  const name = typeof body.name === "string" ? body.name.replace(/[^\p{L}\p{M}' -]/gu, "").trim().slice(0, 40) : "";
  if (!want || want.length > LIMITS.maxWantChars) {
    return NextResponse.json({ code: "bad_request", error: `Say what you want in 1 to ${LIMITS.maxWantChars} characters.` }, { status: 400 });
  }
  // "Make it richer" sends the version on screen, edits included.
  const richer = body.richer === true;
  let draft: { settle: string[]; scene: string[]; closing: string[] } | undefined;
  if (richer) {
    const d = (body.draft ?? {}) as Record<string, unknown>;
    const settle = lines(d.settle), scene = lines(d.scene), closing = lines(d.closing);
    if (!settle || !scene || !closing) {
      return NextResponse.json({ code: "bad_request", error: "Send the current draft to make it richer." }, { status: 400 });
    }
    draft = { settle, scene, closing };
    const n = Number.isSafeInteger(body.regenerations) ? (body.regenerations as number) : 0;
    if (n >= LIMITS.maxExpandRegenerations) {
      return NextResponse.json({ code: "richer_limit", error: "That is as rich as this one gets. Edit it by hand, or start a new one." }, { status: 429 });
    }
  }
  const tone = resolveTone(body.tone);

  const ip = visitor(req);
  const refused = takeExpandSlot(ip);
  if (refused) return NextResponse.json(refused, { status: refused.status });
  const budget = await underCeiling(key);
  if (!budget.ok) {
    returnExpandSlot(ip);
    return NextResponse.json(budget.refusal, { status: budget.refusal.status });
  }

  const made = await expandWish({ key, want, name, feel: tone.scriptNote, draft, richer });
  if (made.model || made.costUsd !== null) {
    await record({ route: "expand", kind: "script", model: made.model ?? null, chars: 0, estUsd: made.costUsd, ok: made.ok });
  }
  if (!made.ok) {
    if (made.reason === "unavailable") returnExpandSlot(ip);
    return NextResponse.json({ code: "expand_failed", error: "A fuller version could not be written just now." }, { status: 502 });
  }
  const { expansion } = made;
  const vet = await vetScript(key, allLines(expansion));
  if (vet.ok || vet.reason !== "unavailable") {
    await record({ route: "expand", kind: "vet", model: vet.model, chars: allLines(expansion).join(" ").length, estUsd: vet.costUsd });
  }
  if (!vet.ok) {
    if (vet.reason === "unavailable") returnExpandSlot(ip);
    return vet.reason === "rejected"
      ? NextResponse.json({ code: "not_recordable", error: "This one can't be turned into a recording." }, { status: 422 })
      : NextResponse.json({ code: "vet_unavailable", error: "Drafting is paused for a moment." }, { status: 503 });
  }

  const flags = reviewFlags(expansion, want, name);
  return NextResponse.json({
    settle: expansion.settle,
    scene: expansion.scene,
    closing: expansion.closing,
    flags,
    // True while a claim, number or name the writer added is unconfirmed.
    holdAudio: holdsAudio(flags),
    vetted: true,
    // A neutral line for the UI to show for health or money wishes. The text above is not changed.
    note: wishNote(want),
    model: made.model,
  });
}
