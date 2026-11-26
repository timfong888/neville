import { NextResponse } from "next/server";
import { apiKey } from "@/lib/server/openrouter";
import { LIMITS, generationEnabled, takeSlot, underCeiling } from "@/lib/server/limits";
import { synthesize } from "@/lib/server/tts";
import { vetScript } from "@/lib/server/vet";
import { estimateSpeech, record } from "@/lib/server/ledger";
import { parseRerecord } from "@/lib/rerecord";
import { resolveVoice } from "@/lib/voices";
import { type Charged, charge, whoIsAsking } from "@/lib/server/paywall";
import { pauseFor, resolvePace, resolveTone, speedFor, styleInstruction } from "@/lib/delivery";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Same style line /api/manifest sends Gemini voices today.
const STYLE = "Speak slowly, calmly and warmly, like a meditation guide. Leave a short pause after each sentence.";
const TAKES_STYLE = /^google\/gemini/;

// Atomic voices re-record at the default pace and tone (Slow, Calm), with the
// same speed, style instruction and pause /api/manifest sends for them.
const DEFAULT_PACE = resolvePace(undefined);
const DEFAULT_TONE = resolveTone(undefined);
const DEFAULT_DELIVERY = {
  pauseMs: pauseFor(DEFAULT_PACE, DEFAULT_TONE),
  speed: speedFor(DEFAULT_PACE, DEFAULT_TONE),
  instructions: styleInstruction(DEFAULT_PACE, DEFAULT_TONE),
};

function visitor(req: Request): string {
  return (
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

// Records a script the person edited. Same guards as /api/manifest: the kill
// switch, the daily slots, and the spend ceiling. The text model vets the
// script but does not rewrite it. Nothing is stored.
// With PAYWALL_ENABLED=true it also needs sign-in and spends credits (config/credits.json, costs.rerecord);
// the credits are given back if no recording is made (#168).
export async function POST(req: Request) {
  const state: { charged?: Charged } = {};
  try {
    return await handle(req, state);
  } catch (e) {
    await state.charged?.refund();
    throw e;
  }
}

async function handle(req: Request, state: { charged?: Charged }): Promise<Response> {
  if (!generationEnabled()) {
    return NextResponse.json({ code: "off", error: "Recording is switched off." }, { status: 503 });
  }
  const key = apiKey();
  if (!key) return NextResponse.json({ code: "off", error: "Recording is not set up here." }, { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "bad_request", error: "Send JSON." }, { status: 400 });
  }
  const parsed = parseRerecord(body, LIMITS.maxScriptChars);
  if (!parsed.ok) return NextResponse.json({ code: "bad_request", error: parsed.error }, { status: 400 });
  const { lines } = parsed.value;
  const voice = resolveVoice(parsed.value.voiceId);

  const ip = visitor(req);
  const slot = await takeSlot(ip);
  if (slot.refusal) return NextResponse.json(slot.refusal, { status: slot.refusal.status });

  const budget = await underCeiling(key);
  if (!budget.ok) {
    await slot.release();
    return NextResponse.json(budget.refusal, { status: budget.refusal.status });
  }

  // Sign-in comes after the IP, daily and spend-ceiling guards, which stay the backstop for every request. A
  // signed-out request keeps its slot, so it counts against the limits; a misconfiguration costs nobody one.
  const who = await whoIsAsking(req);
  if ("response" in who) {
    if (who.response.status !== 401) await slot.release();
    return who.response;
  }

  // Taken before the first paid call (the vet); given back below unless a recording is made.
  const charged = await charge(who, "rerecord");
  if ("response" in charged) {
    await slot.release();
    return charged.response;
  }
  state.charged = charged;

  const vet = await vetScript(key, lines);
  if (vet.ok || vet.reason !== "unavailable") {
    await record({ route: "rerecord", kind: "vet", model: vet.model, chars: lines.join(" ").length, estUsd: vet.costUsd });
  }
  if (!vet.ok) {
    // A rejection was a paid model call, so it keeps its slot: otherwise a
    // caller could loop rejected scripts past the daily limits. Only a check
    // that never answered gives the slot back.
    if (vet.reason === "unavailable") await slot.release();
    await charged.refund();
    return vet.reason === "rejected"
      ? NextResponse.json(
          { code: "not_recordable", error: "This script can't be recorded. Your device's voice can still read it." },
          { status: 422 },
        )
      : NextResponse.json({ code: "vet_unavailable", error: "Recording is paused for a moment." }, { status: 503 });
  }
  // Checked again so the switch also stops a request already under way.
  if (!generationEnabled()) {
    await slot.release();
    await charged.refund();
    return NextResponse.json({ code: "off", error: "Recording is switched off." }, { status: 503 });
  }

  const text = lines.join(" ");
  const speech = await synthesize({
    key,
    model: voice.model,
    voice: voice.voice,
    text,
    instructions: TAKES_STYLE.test(voice.model) ? STYLE : undefined,
    compact: true,
    timeoutMs: 42_000,
    // Voices flagged atomic record the edited lines in one request with a
    // pause after each, at the default pace's speed, style and pause, as
    // /api/manifest does (#76). Other voices keep the one-request text above.
    ...(voice.atomic === true ? { lines, ...DEFAULT_DELIVERY, atomic: true } : {}),
  });
  if (!speech.ok) {
    // A failed recording may still have been billed in part (several requests
    // for a long script), so it is recorded, unpriced.
    await record({ route: "rerecord", kind: "speech", model: voice.model, voiceId: voice.id, chars: speech.sentChars ?? text.length, estUsd: null, ok: false });
    console.warn("[voice_failed]", JSON.stringify({ route: "rerecord", model: voice.model, voiceId: voice.id, status: speech.status, message: speech.message }));
    await charged.refund();
    return NextResponse.json({ code: "voice_failed", error: "The voice could not be recorded just now." }, { status: 502 });
  }
  await record({
    route: "rerecord",
    kind: "speech",
    model: voice.model,
    voiceId: voice.id,
    // What was sent, as billed: pause tags and any discarded first take included.
    chars: speech.sentChars,
    estUsd: await estimateSpeech(voice.model, speech.sentChars),
  });
  return new NextResponse(speech.audio, {
    headers: {
      "Content-Type": speech.mime,
      "Cache-Control": "no-store",
      ...(charged.left !== null ? { "X-Credits-Left": charged.left } : {}),
      "X-Voice-Id": voice.id,
      "X-Chars": String(text.length),
    },
  });
}
