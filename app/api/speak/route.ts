import { NextResponse } from "next/server";
import { OPENROUTER, apiKey, listSpeechModels, paidCallsAllowed } from "@/lib/server/openrouter";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_CHARS = 1000;
const MAX_INSTRUCTIONS = 300;
// Models that only return raw PCM; we wrap it in a WAV header so browsers can play it.
const PCM_ONLY = /^(heygen\/|google\/gemini)/;
// Raw PCM carries no sample rate. Use the one the upstream response states,
// else a per-model default: HeyGen has stated 44.1 kHz, Gemini documents 24 kHz.
function pcmRate(model: string, contentType: string | null): number {
  const stated = Number(/rate=(\d+)/.exec(contentType ?? "")?.[1]);
  if (stated >= 8000 && stated <= 96000) return stated;
  return model.startsWith("heygen/") ? 44100 : 24000;
}

// Per-request text caps, found by the upstream rejecting longer input.
const PER_REQUEST_LIMIT: Record<string, number> = {
  "canopylabs/orpheus": 300,
  "sesame/csm": 200,
};

/** Split at sentence ends into pieces no longer than `limit`; hard-split a sentence only if it must. */
function splitText(text: string, limit: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = "";
  };
  for (let sentence of sentences) {
    if ((cur + sentence).trim().length <= limit) {
      cur += sentence;
      continue;
    }
    flush();
    while (sentence.trim().length > limit) {
      const cut = sentence.lastIndexOf(" ", limit);
      const at = cut > 0 ? cut : limit;
      out.push(sentence.slice(0, at).trim());
      sentence = sentence.slice(at);
    }
    cur = sentence;
  }
  flush();
  return out;
}

function join(chunks: ArrayBuffer[]): ArrayBuffer {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(new Uint8Array(c), at);
    at += c.byteLength;
  }
  return out.buffer;
}

function wav(pcm: ArrayBuffer, rate: number): ArrayBuffer {
  const out = new Uint8Array(44 + pcm.byteLength);
  const v = new DataView(out.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + pcm.byteLength, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, pcm.byteLength, true);
  out.set(new Uint8Array(pcm), 44);
  return out.buffer;
}

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

  // Some models cap the text per request. Longer scripts go sentence by
  // sentence as raw PCM, which can be joined end to end; MP3 files cannot.
  const limit = Object.entries(PER_REQUEST_LIMIT).find(([prefix]) => model.startsWith(prefix))?.[1];
  const parts = limit && text.length > limit ? splitText(text, limit) : [text];
  const pcm = PCM_ONLY.test(model) || parts.length > 1;

  const chunks: ArrayBuffer[] = [];
  const ids: string[] = [];
  let contentType: string | null = null;
  for (const part of parts) {
    const res = await fetch(`${OPENROUTER}/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Neville" },
      body: JSON.stringify({
        model,
        ...(voice ? { voice } : {}),
        ...(instructions ? { instructions } : {}),
        input: part,
        response_format: pcm ? "pcm" : "mp3",
      }),
    });
    if (!res.ok) {
      let message = `OpenRouter returned ${res.status}.`;
      try {
        const j = (await res.json()) as { error?: { message?: string } };
        if (j.error?.message) message = j.error.message.slice(0, 300);
      } catch {
        /* keep the generic message */
      }
      return NextResponse.json({ error: message }, { status: res.status === 402 ? 402 : 502 });
    }
    chunks.push(await res.arrayBuffer());
    contentType = res.headers.get("content-type");
    const id = res.headers.get("X-Generation-Id");
    if (id) ids.push(id);
  }

  const audio = chunks.length === 1 ? chunks[0] : join(chunks);
  const estCost = m.usdPerMChars === null ? null : (text.length * m.usdPerMChars) / 1e6;
  return new NextResponse(pcm ? wav(audio, pcmRate(model, contentType)) : audio, {
    headers: {
      "Content-Type": pcm ? "audio/wav" : "audio/mpeg",
      "Cache-Control": "no-store",
      "X-Chars": String(text.length),
      "X-Est-Cost-Usd": estCost === null ? "" : estCost.toFixed(6),
      "X-Generation-Id": ids.join(","),
      "X-Requests": String(parts.length),
    },
  });
}
