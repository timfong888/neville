import { NextResponse } from "next/server";
import { apiKey } from "@/lib/server/openrouter";
import { LIMITS, generationEnabled, returnSlot, takeSlot, underCeiling } from "@/lib/server/limits";
import { synthesize } from "@/lib/server/tts";
import { vetScript } from "@/lib/server/vet";
import { estimateSpeech, record } from "@/lib/server/ledger";
import { parseRerecord } from "@/lib/rerecord";
import { resolveVoice } from "@/lib/voices";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Same style line /api/manifest sends Gemini voices today.
const STYLE = "Speak slowly, calmly and warmly, like a meditation guide. Leave a short pause after each sentence.";
const TAKES_STYLE = /^google\/gemini/;

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
export async function POST(req: Request) {
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
  const refused = takeSlot(ip);
  if (refused) return NextResponse.json(refused, { status: refused.status });

  const budget = await underCeiling(key);
  if (!budget.ok) {
    returnSlot(ip);
    return NextResponse.json(budget.refusal, { status: budget.refusal.status });
  }

  const vet = await vetScript(key, lines);
  if (vet.ok || vet.reason !== "unavailable") {
    await record({ route: "rerecord", kind: "vet", model: vet.model, chars: lines.join(" ").length, estUsd: vet.costUsd });
  }
  if (!vet.ok) {
    // A rejection was a paid model call, so it keeps its slot: otherwise a
    // caller could loop rejected scripts past the daily limits. Only a check
    // that never answered gives the slot back.
    if (vet.reason === "unavailable") returnSlot(ip);
    return vet.reason === "rejected"
      ? NextResponse.json(
          { code: "not_recordable", error: "This script can't be recorded. Your device's voice can still read it." },
          { status: 422 },
        )
      : NextResponse.json({ code: "vet_unavailable", error: "Recording is paused for a moment." }, { status: 503 });
  }
  // Checked again so the switch also stops a request already under way.
  if (!generationEnabled()) {
    returnSlot(ip);
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
  });
  if (!speech.ok) {
    // A failed recording may still have been billed in part (several requests
    // for a long script), so it is recorded, unpriced.
    await record({ route: "rerecord", kind: "speech", model: voice.model, voiceId: voice.id, chars: text.length, estUsd: null, ok: false });
    return NextResponse.json({ code: "voice_failed", error: "The voice could not be recorded just now." }, { status: 502 });
  }
  await record({
    route: "rerecord",
    kind: "speech",
    model: voice.model,
    voiceId: voice.id,
    chars: text.length,
    estUsd: await estimateSpeech(voice.model, text.length),
  });
  return new NextResponse(speech.audio, {
    headers: {
      "Content-Type": speech.mime,
      "Cache-Control": "no-store",
      "X-Voice-Id": voice.id,
      "X-Chars": String(text.length),
    },
  });
}
