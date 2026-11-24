import { NextResponse } from "next/server";
import { apiKey } from "@/lib/server/openrouter";
import { LIMITS, generationEnabled, takeSlot, underCeiling } from "@/lib/server/limits";
import { synthesize } from "@/lib/server/tts";
import { writeScript } from "@/lib/server/writer";
import { estimateSpeech, record } from "@/lib/server/ledger";
import { pauseFor, resolvePace, resolveTone, speedFor, styleInstruction } from "@/lib/delivery";
import { resolveVoice } from "@/lib/voices";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Only these models take a style instruction apart from the script. It is
// never part of the spoken text, so it cannot be read aloud.
const TAKES_STYLE = /^google\/gemini/;

function visitor(req: Request): string {
  // On Vercel these are set by the platform, not by the caller.
  return (
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

// The app's one paid path: a wish in, a script and its recording out.
// Nothing is stored. Guards are in lib/server/limits.ts.
export async function POST(req: Request) {
  if (!generationEnabled()) {
    return NextResponse.json({ code: "off", error: "Recording is switched off." }, { status: 503 });
  }
  const key = apiKey();
  if (!key) return NextResponse.json({ code: "off", error: "Recording is not set up here." }, { status: 503 });

  let body: { want?: unknown; name?: unknown; voiceId?: unknown; variant?: unknown; pace?: unknown; tone?: unknown };
  try {
    body = await req.json();
    if (!body || typeof body !== "object") throw new Error("not an object");
  } catch {
    return NextResponse.json({ code: "bad_request", error: "Send JSON." }, { status: 400 });
  }
  const want = typeof body.want === "string" ? body.want.replace(/\s+/g, " ").trim() : "";
  const name = typeof body.name === "string" ? body.name.replace(/[^\p{L}\p{M}' -]/gu, "").trim().slice(0, 40) : "";
  const variant = Number.isSafeInteger(body.variant) ? Math.abs(body.variant as number) % 50 : 0;
  if (!want || want.length > LIMITS.maxWantChars) {
    return NextResponse.json(
      { code: "bad_request", error: `Say what you want in 1 to ${LIMITS.maxWantChars} characters.` },
      { status: 400 },
    );
  }
  // The browser sends only an id. The model and voice come from the config.
  const voice = resolveVoice(typeof body.voiceId === "string" ? body.voiceId : null);
  // Pace and tone are preset ids too. Speed, pause and instruction come from lib/delivery.ts.
  const pace = resolvePace(body.pace);
  const tone = resolveTone(body.tone);

  const ip = visitor(req);
  const slot = await takeSlot(ip);
  if (slot.refusal) return NextResponse.json(slot.refusal, { status: slot.refusal.status });

  const budget = await underCeiling(key);
  if (!budget.ok) {
    await slot.release();
    return NextResponse.json(budget.refusal, { status: budget.refusal.status });
  }

  const script = await writeScript({ key, want, name, variant, toneNote: tone.scriptNote });
  // A blank line between lines is the pause we can ask of voices whose audio
  // cannot be stitched; the others get real silence between lines.
  const text = script.lines.join("\n\n");
  // Characters actually spoken, for the ledger: the blank lines between lines
  // are not sent when a voice is recorded line by line.
  const spoken = script.lines.join(" ").length;
  if (script.source === "model") {
    // Text-model cost is not returned by the writer; at these prices it is a
    // few thousandths of a cent, so it is recorded as unpriced.
    await record({ route: "manifest", kind: "script", model: script.model ?? null, chars: spoken, estUsd: null });
  }
  const speech = await synthesize({
    key,
    model: voice.model,
    voice: voice.voice,
    text,
    lines: script.lines,
    pauseMs: pauseFor(pace, tone),
    speed: speedFor(pace, tone),
    instructions: TAKES_STYLE.test(voice.model) ? styleInstruction(pace, tone) : undefined,
    compact: true,
    timeoutMs: 42_000,
    atomic: voice.atomic === true,
  });
  if (!speech.ok) {
    // A failed recording may still have been billed in part (several requests
    // for a long script), so it is recorded, unpriced.
    await record({ route: "manifest", kind: "speech", model: voice.model, voiceId: voice.id, chars: spoken, estUsd: null, ok: false });
    // The upstream reason, so a failure can be read from the log (#73). Never the key.
    console.warn("[voice_failed]", JSON.stringify({ route: "manifest", model: voice.model, voiceId: voice.id, status: speech.status, message: speech.message }));
    return NextResponse.json(
      {
        code: "voice_failed",
        error: "The voice could not be recorded just now.",
        // The model's script was already written and vetted: the device voice
        // reads it instead of the general one. A template script is not sent.
        ...(script.source === "model" ? { lines: script.lines } : {}),
      },
      { status: 502 },
    );
  }

  await record({
    route: "manifest",
    kind: "speech",
    model: voice.model,
    voiceId: voice.id,
    // A discarded first take (too long for one response) was billed as well.
    chars: spoken + (speech.discardedChars ?? 0),
    estUsd: await estimateSpeech(voice.model, spoken + (speech.discardedChars ?? 0)),
  });
  return new NextResponse(speech.audio, {
    headers: {
      "Content-Type": speech.mime,
      "Cache-Control": "no-store",
      "X-Script": Buffer.from(JSON.stringify(script.lines), "utf8").toString("base64"),
      "X-Script-Source": script.source,
      "X-Voice-Id": voice.id,
      "X-Chars": String(text.length),
      "X-Pace": pace.id,
      "X-Tone": tone.id,
      // Whether the model took the speed we sent, and the pause used between lines.
      "X-Speed-Applied": speech.speedApplied ? "1" : "0",
      ...(speech.pauseMs ? { "X-Pause-Ms": String(speech.pauseMs) } : {}),
      ...(speech.starts ? { "X-Line-Starts": JSON.stringify(speech.starts) } : {}),
    },
  });
}
