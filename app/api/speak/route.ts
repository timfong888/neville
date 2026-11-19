import { NextResponse } from "next/server";
import { apiKey, listSpeechModels, paidCallsAllowed } from "@/lib/server/openrouter";
import { synthesize } from "@/lib/server/tts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_CHARS = 1000;
const MAX_INSTRUCTIONS = 300;
// One paid text-to-speech call. Preview and local only; the key's own credit
// limit is the spend cap.
export async function POST(req: Request) {
  if (!paidCallsAllowed()) return NextResponse.json({ error: "Not available in production yet." }, { status: 404 });
  const key = apiKey();
  if (!key) return NextResponse.json({ error: "OPENROUTER_API_KEY is not set for this environment." }, { status: 503 });

  let body: { model?: unknown; voice?: unknown; text?: unknown; instructions?: unknown };
  try {
    body = await req.json();
    if (!body || typeof body !== "object") throw new Error("not an object");
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 });
  }
  const model = typeof body.model === "string" ? body.model : "";
  const voice = typeof body.voice === "string" ? body.voice : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  // A style instruction for models that take one apart from the script (Gemini,
  // Fish Audio). OpenRouter ignores it for the rest.
  const instructions = typeof body.instructions === "string" ? body.instructions.trim().slice(0, MAX_INSTRUCTIONS) : "";
  if (!text || text.length > MAX_CHARS) {
    return NextResponse.json({ error: `Text must be 1 to ${MAX_CHARS} characters.` }, { status: 400 });
  }

  const { models } = await listSpeechModels();
  const m = models.find((x) => x.id === model);
  // Models that list voices take only those. Models that list none (Fish Audio)
  // use their default voice, or a Fish voice id: 32 hex characters.
  const voiceOk = m && (m.voices.length > 0 ? m.voices.includes(voice) : voice === "" || /^[a-f0-9]{32}$/.test(voice));
  if (!m || !voiceOk) {
    return NextResponse.json({ error: "Unknown model or voice." }, { status: 400 });
  }

  const out = await synthesize({ key, model, voice, text, instructions });
  if (!out.ok) return NextResponse.json({ error: out.message }, { status: out.status });

  const estCost = m.usdPerMChars === null ? null : (text.length * m.usdPerMChars) / 1e6;
  return new NextResponse(out.audio, {
    headers: {
      "Content-Type": out.mime,
      "Cache-Control": "no-store",
      "X-Chars": String(text.length),
      "X-Est-Cost-Usd": estCost === null ? "" : estCost.toFixed(6),
      "X-Generation-Id": out.ids.join(","),
      "X-Requests": String(out.requests),
    },
  });
}
