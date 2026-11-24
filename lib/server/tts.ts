// One place that turns text into audio through OpenRouter. Used by the voice
// bake-off (/api/speak) and by the app itself (/api/manifest).
import "server-only";
import { MAX_AUDIO_BYTES, fitPause, silenceBytes, splitAtPauses, startShares, stitchPcm } from "@/lib/delivery";
import { normalizePcm16 } from "@/lib/loudness";
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
  | {
      ok: true;
      audio: ArrayBuffer;
      mime: "audio/wav" | "audio/mpeg";
      requests: number;
      ids: string[];
      /** True when the model took the speed we sent; false when it was left out or refused. */
      speedApplied: boolean;
      /** Where each line starts as a share of the whole, when lines were stitched with pauses. */
      starts?: number[];
      /** The pause actually used between lines, in ms. */
      pauseMs?: number;
    }
  | { ok: false; status: number; message: string };

/** Waits before each retry of a line after a provider error; one entry per retry. */
const RETRY_DELAYS_MS = [400, 1200];

/** How many line requests run at once when lines are stitched. */
const LINE_CONCURRENCY = 3;

/** Runs `fn` over `items` with at most `n` in flight, keeping the order of results. */
async function mapLimit<T, R>(
  items: T[],
  n: number,
  fn: (item: T) => Promise<R>,
  /** True for a result that should stop any further items from starting. */
  stop: (r: R) => boolean = () => false,
): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  let halted = false;
  const worker = async () => {
    while (!halted && next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
      if (stop(out[i])) halted = true;
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

type Piece = { ok: true; audio: ArrayBuffer; contentType: string | null; id: string | null } | { ok: false; status: number; message: string };

/**
 * One piece of speech. An empty voice means the model's own default.
 * `compact` halves 44.1 kHz and higher PCM so a minute of audio stays well
 * under the size a serverless response may carry.
 *
 * Delivery: `speed` is sent to the model; if the model refuses it, the piece is
 * asked again without it. `lines` with `pauseMs` records each line on its own
 * and joins them with silence, for models whose audio is raw PCM. Other models
 * get `text` in one request, where a blank line between sentences is the only
 * pause we can ask for. `timeoutMs` is the budget for the whole call.
 */
export async function synthesize(opts: {
  key: string;
  model: string;
  voice: string;
  text: string;
  lines?: string[];
  pauseMs?: number;
  speed?: number;
  instructions?: string;
  compact?: boolean;
  timeoutMs?: number;
  /** Record `lines` in one request with inline pauses (#76). For voices flagged `atomic`. */
  atomic?: boolean;
}): Promise<Speech> {
  if (opts.atomic && opts.lines && opts.lines.length > 1 && PCM_ONLY.test(opts.model)) {
    const started = Date.now();
    const one = await synthesizeAtomic(opts);
    // Too long for one response (a very slow read): record line by line instead,
    // where the pauses can be shortened to fit.
    if (!one.ok && one.status === 413 && Date.now() - started < (opts.timeoutMs ?? 55_000) / 2) {
      return synthesize({ ...opts, atomic: false, timeoutMs: (opts.timeoutMs ?? 55_000) - (Date.now() - started) });
    }
    return one;
  }
  const { key, model, voice, text, instructions } = opts;
  const deadline = Date.now() + (opts.timeoutMs ?? 55_000);
  const stitch = Boolean(
    opts.lines && opts.lines.length > 1 && (opts.pauseMs ?? 0) > 0 && PCM_ONLY.test(model),
  );
  // Some models cap the text per request. Longer scripts go sentence by
  // sentence as raw PCM, which can be joined end to end; MP3 files cannot.
  const limit = Object.entries(PER_REQUEST_LIMIT).find(([prefix]) => model.startsWith(prefix))?.[1];
  const parts = stitch ? opts.lines! : limit && text.length > limit ? splitText(text, limit) : [text];
  const pcm = PCM_ONLY.test(model) || parts.length > 1;
  // 1 is the model's own pace, so it is not sent. Brisk asks for a little faster.
  const wantSpeed = opts.speed && opts.speed >= 0.5 && opts.speed <= 1.2 && opts.speed !== 1 ? opts.speed : undefined;
  let speedRefused = false;
  let speedSent = false;

  const one = async (part: string): Promise<Piece> => {
    for (const withSpeed of wantSpeed && !speedRefused ? [true, false] : [false]) {
      let res: Response | null = null;
      // A provider error (5xx) or a dropped connection is usually brief: HeyGen
      // answers about 1 request in 16 with a 500. A script is recorded line by
      // line, so without a retry one such answer loses the whole recording (#73).
      for (let attempt = 0; ; attempt++) {
        const left = deadline - Date.now();
        if (left < 1000) return { ok: false, status: 504, message: "The voice service did not answer in time." };
        try {
          res = await fetch(`${OPENROUTER}/audio/speech`, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Neville" },
            body: JSON.stringify({
              model,
              ...(voice ? { voice } : {}),
              ...(instructions ? { instructions } : {}),
              ...(withSpeed ? { speed: wantSpeed } : {}),
              input: part,
              response_format: pcm ? "pcm" : "mp3",
            }),
            signal: AbortSignal.timeout(left),
          });
        } catch {
          res = null;
        }
        const transient = !res || res.status >= 500;
        const wait = RETRY_DELAYS_MS[attempt];
        if (!transient || wait === undefined || deadline - Date.now() < wait + 2000) break;
        await res?.body?.cancel().catch(() => {});
        await new Promise((r) => setTimeout(r, wait));
      }
      if (!res) return { ok: false, status: 504, message: "The voice service did not answer in time." };
      if (!res.ok) {
        // A model that does not know `speed` may answer 400 or 422. Ask again without it.
        if (withSpeed && (res.status === 400 || res.status === 422)) {
          speedRefused = true;
          continue;
        }
        let message = `OpenRouter returned ${res.status}.`;
        try {
          const j = (await res.json()) as { error?: { message?: string } };
          if (j.error?.message) message = j.error.message.slice(0, 300);
        } catch {
          /* keep the generic message */
        }
        return { ok: false, status: res.status === 402 ? 402 : 502, message };
      }
      if (withSpeed) speedSent = true;
      return {
        ok: true,
        audio: await res.arrayBuffer(),
        contentType: res.headers.get("content-type"),
        id: res.headers.get("X-Generation-Id"),
      };
    }
    return { ok: false, status: 502, message: "The voice service refused the request." };
  };

  // After a failure no new line is started, so no further paid recordings are made
  // for audio that will be thrown away. Lines already in flight finish.
  const pieces: Piece[] = stitch ? await mapLimit(parts, LINE_CONCURRENCY, one, (p) => !p.ok) : [];
  if (!stitch) {
    for (const part of parts) {
      const piece = await one(part);
      pieces.push(piece);
      if (!piece.ok) break;
    }
  }
  const failed = pieces.find((p) => p && !p.ok);
  if (failed && !failed.ok) return failed;
  const done = pieces as Extract<Piece, { ok: true }>[];

  const ids = done.map((p) => p.id).filter((x): x is string => Boolean(x));
  const speedApplied = speedSent && !speedRefused;
  let chunks = done.map((p) => p.audio);
  // MP3 voices (Kokoro, Fish) keep the provider's own level: there is no MP3
  // decoder here. Normalising them is #40. The default voice and the voice mix
  // are PCM voices, so they all arrive at the same loudness.
  if (!pcm) return { ok: true, audio: chunks[0], mime: "audio/mpeg", requests: parts.length, ids, speedApplied };

  let rate = pcmRate(model, done[0].contentType);
  if (opts.compact && rate >= 44100) {
    chunks = chunks.map(halve);
    rate = rate / 2;
  }
  if (!stitch) {
    // Every PCM voice (Gemini, HeyGen) is brought to the same speech loudness, so tracks match in a playlist.
    const pcmAll = normalizePcm16(chunks.length === 1 ? chunks[0] : join(chunks), rate);
    return { ok: true, audio: wav(pcmAll, rate), mime: "audio/wav", requests: parts.length, ids, speedApplied };
  }
  const sizes = chunks.map((c) => c.byteLength);
  const pauseMs = fitPause({
    pauseMs: opts.pauseMs!,
    gaps: chunks.length - 1,
    speechBytes: sizes.reduce((n, b) => n + b, 0),
    rate,
  });
  const gap = silenceBytes(pauseMs, rate);
  const audio = wav(normalizePcm16(stitchPcm(chunks, gap), rate), rate);
  // Too big for a response even with no pauses: say so, rather than send a file Vercel will refuse.
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    return { ok: false, status: 502, message: "The recording came out too long to send." };
  }
  return {
    ok: true,
    audio,
    mime: "audio/wav",
    requests: parts.length,
    ids,
    speedApplied,
    starts: startShares(sizes, gap),
    pauseMs,
  };
}

/** The pause written between lines in an atomic request. Gemini honours it and does not speak it. */
export const INLINE_PAUSE = "[pause]";

/** The text of an atomic request: every line, with a pause written between them. */
export function atomicText(lines: string[]): string {
  return lines.map((l) => l.trim()).join(` ${INLINE_PAUSE} `);
}

/**
 * Where each line starts as a share of the whole, estimated for audio recorded
 * in one piece: speech time in proportion to characters, plus a fixed pause
 * between lines. Good to about a second, enough for the read-along highlight.
 */
export function estimateStarts(lines: string[], durationS: number, pauseS = 1.8): number[] {
  const chars = lines.map((l) => Math.max(1, l.length));
  const total = chars.reduce((n, c) => n + c, 0);
  const gaps = lines.length - 1;
  const perChar = (durationS - gaps * pauseS) / total;
  const out: number[] = [];
  let t = 0;
  for (let i = 0; i < lines.length; i++) {
    out.push(durationS > 0 ? Math.min(1, t / durationS) : 0);
    t += perChar > 0 ? chars[i] * perChar + pauseS : (chars[i] / total) * durationS;
  }
  return out;
}

/**
 * The whole script in one request: one failure point, retried by `synthesize`
 * as a whole. The voice is told to pause between lines; those pauses are then
 * found and set to the pace's own length, so the delivery matches the line by
 * line recordings, and each line's start is known exactly.
 */
async function synthesizeAtomic(opts: Parameters<typeof synthesize>[0]): Promise<Speech> {
  const lines = opts.lines!;
  const out = await synthesize({ ...opts, atomic: false, text: atomicText(lines), lines: undefined, pauseMs: 0 });
  if (!out.ok) return out;
  // WAV: 44-byte header, 16-bit mono.
  const rate = new DataView(out.audio).getUint32(24, true) || 24000;
  const pcm = out.audio.slice(44);
  const pieces = splitAtPauses(pcm, rate, lines.length);
  if (!pieces) {
    if (out.audio.byteLength > MAX_AUDIO_BYTES) {
      return { ok: false, status: 413, message: "The recording came out too long to send in one piece." };
    }
    return { ...out, starts: estimateStarts(lines, (out.audio.byteLength - 44) / 2 / rate) };
  }
  const sizes = pieces.map((p) => p.byteLength);
  const pauseMs = fitPause({
    pauseMs: opts.pauseMs ?? 0,
    gaps: pieces.length - 1,
    speechBytes: sizes.reduce((n, b) => n + b, 0),
    rate,
  });
  const gap = silenceBytes(pauseMs, rate);
  const audio = wav(stitchPcm(pieces, gap), rate);
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    return { ok: false, status: 413, message: "The recording came out too long to send in one piece." };
  }
  return { ...out, audio, starts: startShares(sizes, gap), pauseMs };
}
