import { NextResponse } from "next/server";
import { apiKey } from "@/lib/server/openrouter";
import { LIMITS, generationEnabled, takeSlot, underCeiling } from "@/lib/server/limits";
import { synthesize } from "@/lib/server/tts";
import { writeScript } from "@/lib/server/writer";
import { estimateSpeech, record } from "@/lib/server/ledger";
import { pauseFor, resolvePace, resolveTone, speedFor, styleInstruction } from "@/lib/delivery";
import { resolveVoice } from "@/lib/voices";
import { type Charged, charge, whoIsAsking } from "@/lib/server/paywall";

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
// Nothing is stored. Guards are in lib/server/limits.ts. With PAYWALL_ENABLED=true it also needs
// sign-in and one credit per recording (lib/server/paywall.ts, #168); a credit is given back if
// the recording fails after it was taken.
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

  let body: { want?: unknown; name?: unknown; voiceId?: unknown; variant?: unknown; pace?: unknown; tone?: unknown; repeat?: unknown };
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

  // Sign-in comes after the IP, daily and spend-ceiling guards, which stay the backstop for every request. A
  // signed-out request keeps its slot, so it counts against the limits; a misconfiguration costs nobody one.
  const who = await whoIsAsking(req);
  if ("response" in who) {
    if (who.response.status !== 401) await slot.release();
    return who.response;
  }

  // The last gate before anything is paid for: the guards above are the backstop, this is the account's quota.
  const charged = await charge(who, "manifest");
  if ("response" in charged) {
    await slot.release();
    return charged.response;
  }
  state.charged = charged;

  const script = await writeScript({ key, want, name, variant, toneNote: tone.scriptNote });
  // Programming mode (#77): the refrain is recorded once, as one more line at
  // the end, and the app loops it. Only voices recorded as PCM with line starts
  // can be cut apart in the browser.
  const repeat = body.repeat === true && /^(?:heygen\/|google\/gemini)/.test(voice.model);
  const recorded = repeat ? [...script.lines, script.refrain] : script.lines;
  // A blank line between lines is the pause we can ask of voices whose audio
  // cannot be stitched; the others get real silence between lines.
  const text = recorded.join("\n\n");
  // Characters actually spoken, for the ledger: the blank lines between lines
  // are not sent when a voice is recorded line by line.
  const spoken = recorded.join(" ").length;
  if (script.source === "model") {
    // Text-model cost is not returned by the writer; at these prices it is a
    // few thousandths of a cent, so it is recorded as unpriced.
    await record({ route: "manifest", kind: "script", source: script.source, model: script.model ?? null, chars: spoken, estUsd: null });
  }
  const speech = await synthesize({
    key,
    model: voice.model,
    voice: voice.voice,
    text,
    lines: recorded,
    // The refrain follows the closing with no pause, and its length does not
    // shorten the pauses between the script's lines.
    tail: repeat ? 1 : 0,
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
    await record({ route: "manifest", kind: "speech", model: voice.model, voiceId: voice.id, chars: speech.sentChars ?? spoken, estUsd: null, ok: false });
    // The upstream reason, so a failure can be read from the log (#73). Never the key.
    console.warn("[voice_failed]", JSON.stringify({ route: "manifest", model: voice.model, voiceId: voice.id, status: speech.status, message: speech.message }));
    await charged.refund();
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
    // What was sent, as billed: pause tags and any discarded first take included.
    chars: speech.sentChars,
    estUsd: await estimateSpeech(voice.model, speech.sentChars),
  });
  return new NextResponse(speech.audio, {
    headers: {
      "Content-Type": speech.mime,
      "Cache-Control": "no-store",
      "X-Script": Buffer.from(JSON.stringify(script.lines), "utf8").toString("base64"),
      "X-Script-Source": script.source,
      // When set, the last line start belongs to this refrain, recorded after the script.
      ...(repeat && !speech.tailDropped ? { "X-Refrain": Buffer.from(script.refrain, "utf8").toString("base64") } : {}),
      // Repetition was asked for, but this voice's audio cannot be cut apart to
      // loop ("unsupported"), or this take's refrain could not be cut cleanly
      // and was left out ("skipped").
      ...(body.repeat === true && !repeat ? { "X-Repeat": "unsupported" } : {}),
      ...(repeat && speech.tailDropped ? { "X-Repeat": "skipped" } : {}),
      ...(charged.left !== null ? { "X-Credits-Left": charged.left } : {}),
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
