import { NextResponse } from "next/server";
import { apiKey } from "@/lib/server/openrouter";
import { LIMITS, generationEnabled, takeSlot, underCeiling } from "@/lib/server/limits";
import { synthesize } from "@/lib/server/tts";
import { vetScript } from "@/lib/server/vet";
import { estimateSpeech, record } from "@/lib/server/ledger";
import { parseRerecord } from "@/lib/rerecord";
import { resolveVoice } from "@/lib/voices";
import { type PaidState, charge, runPaid, timeoutAnswer, timeoutResponse, voiceBudget, whoIsAsking } from "@/lib/server/paywall";
import { pauseFor, resolvePace, resolveTone, speedFor, styleInstruction } from "@/lib/delivery";
import { isUnlimited } from "@/lib/credits";
import { currentUser } from "@/lib/server/accounts";

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
  return runPaid((state) => handle(req, state));
}

async function handle(req: Request, state: PaidState): Promise<Response> {
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

  // A configured tester must be signed in before their network slot is skipped.
  // This lookup happens even while the paywall is off, so tester access stays useful during testing.
  let session: Awaited<ReturnType<typeof currentUser>> | undefined;
  try {
    session = await currentUser(req);
  } catch {
    // Keep the existing guards and retry the lookup below, so an auth outage
    // cannot spend a daily slot and still preserves its original refusal order.
  }
  const tester = isUnlimited(session);
  if (tester && session) console.info("[tester]", session.id);
  const slot = tester ? null : await takeSlot(visitor(req));
  if (slot?.refusal) return NextResponse.json(slot.refusal, { status: slot.refusal.status });

  const budget = await underCeiling(key);
  if (!budget.ok) {
    await slot?.release();
    return NextResponse.json(budget.refusal, { status: budget.refusal.status });
  }

  // Sign-in comes after the IP, daily and spend-ceiling guards, which stay the backstop for every request. A
  // signed-out request keeps its slot, so it counts against the limits; a misconfiguration costs nobody one.
  let who: Awaited<ReturnType<typeof whoIsAsking>>;
  try {
    who = await whoIsAsking(req, session);
  } catch (e) {
    // The sign-in lookup failed (an auth or database error): give the slot back, so an outage does not use up the daily limits.
    await slot?.release();
    throw e;
  }
  if ("response" in who) {
    if (who.response.status !== 401) await slot?.release();
    return who.response;
  }

  // Taken before the first paid call (the vet); given back below unless a recording is made.
  state.charging = true;
  const charged = await charge(who, "rerecord").finally(() => {
    state.charging = false;
  });
  if ("response" in charged) {
    await slot?.release();
    return charged.response;
  }
  state.charged = charged;
  if (state.timedOut) {
    // The deadline already passed while the credit was being taken: give it back and stop.
    await charged.refund();
    return timeoutResponse(true);
  }

  const vet = await vetScript(key, lines);
  if (vet.ok || vet.reason !== "unavailable") {
    await record({ route: "rerecord", kind: "vet", model: vet.model, chars: lines.join(" ").length, estUsd: vet.costUsd });
  }
  if (!vet.ok) {
    // A rejection was a paid model call, so it keeps its slot: otherwise a
    // caller could loop rejected scripts past the daily limits. Only a check
    // that never answered gives the slot back.
    if (vet.reason === "unavailable") await slot?.release();
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
    await slot?.release();
    await charged.refund();
    return NextResponse.json({ code: "off", error: "Recording is switched off." }, { status: 503 });
  }

  const text = lines.join(" ");
  // The deadline passed during the check: do not start the voice, the credit is already refunded.
  if (state.timedOut) return timeoutResponse(true);
  // With the paywall on, the voice call also ends before the paywall's deadline (50 s); with it off the budget is the same 42 s as before.
  const voiceMs = voiceBudget(state, 42_000);
  if (voiceMs === null) return timeoutAnswer(state);
  const speech = await synthesize({
    key,
    model: voice.model,
    voice: voice.voice,
    text,
    instructions: TAKES_STYLE.test(voice.model) ? STYLE : undefined,
    compact: true,
    timeoutMs: voiceMs,
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
  // The recording is made: mark the spend delivered so it is never refunded by reconciliation.
  if (!state.timedOut) await charged.fulfil(); // a timed-out request was already refunded or left for reconciliation
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
