// One place that turns text into audio through OpenRouter. Used by the voice
// bake-off (/api/speak) and by the app itself (/api/manifest).
import "server-only";
import { OPENROUTER } from "@/lib/server/openrouter";

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
export function splitText(text: string, limit: number): string[] {
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

/** Halve the sample rate of 16-bit mono PCM by averaging each pair of samples. */
function halve(pcm: ArrayBuffer): ArrayBuffer {
  const src = new DataView(pcm);
  const n = Math.floor(pcm.byteLength / 4);
  const out = new DataView(new ArrayBuffer(n * 2));
  for (let i = 0; i < n; i++) {
    out.setInt16(i * 2, (src.getInt16(i * 4, true) + src.getInt16(i * 4 + 2, true)) >> 1, true);
  }
  return out.buffer;
}

export type Speech =
  | { ok: true; audio: ArrayBuffer; mime: "audio/wav" | "audio/mpeg"; requests: number; ids: string[] }
  | { ok: false; status: number; message: string };

/**
 * One piece of speech. An empty voice means the model's own default.
 * `compact` halves 44.1 kHz and higher PCM so a minute of audio stays well
 * under the size a serverless response may carry.
 */
export async function synthesize(opts: {
  key: string;
  model: string;
  voice: string;
  text: string;
  instructions?: string;
  compact?: boolean;
  timeoutMs?: number;
}): Promise<Speech> {
  const { key, model, voice, text, instructions } = opts;
  // Some models cap the text per request. Longer scripts go sentence by
  // sentence as raw PCM, which can be joined end to end; MP3 files cannot.
  const limit = Object.entries(PER_REQUEST_LIMIT).find(([prefix]) => model.startsWith(prefix))?.[1];
  const parts = limit && text.length > limit ? splitText(text, limit) : [text];
  const pcm = PCM_ONLY.test(model) || parts.length > 1;

  const chunks: ArrayBuffer[] = [];
  const ids: string[] = [];
  let contentType: string | null = null;
  for (const part of parts) {
    let res: Response;
    try {
      res = await fetch(`${OPENROUTER}/audio/speech`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Neville" },
        body: JSON.stringify({
          model,
          ...(voice ? { voice } : {}),
          ...(instructions ? { instructions } : {}),
          input: part,
          response_format: pcm ? "pcm" : "mp3",
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 55_000),
      });
    } catch {
      return { ok: false, status: 504, message: "The voice service did not answer in time." };
    }
    if (!res.ok) {
      let message = `OpenRouter returned ${res.status}.`;
      try {
        const j = (await res.json()) as { error?: { message?: string } };
        if (j.error?.message) message = j.error.message.slice(0, 300);
      } catch {
        /* keep the generic message */
      }
      return { ok: false, status: res.status === 402 ? 402 : 502, message };
    }
    chunks.push(await res.arrayBuffer());
    contentType = res.headers.get("content-type");
    const id = res.headers.get("X-Generation-Id");
    if (id) ids.push(id);
  }

  let audio = chunks.length === 1 ? chunks[0] : join(chunks);
  if (!pcm) return { ok: true, audio, mime: "audio/mpeg", requests: parts.length, ids };
  let rate = pcmRate(model, contentType);
  if (opts.compact && rate >= 44100) {
    audio = halve(audio);
    rate = rate / 2;
  }
  return { ok: true, audio: wav(audio, rate), mime: "audio/wav", requests: parts.length, ids };
}
