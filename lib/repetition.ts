// Programming mode (#77): the script, then its refrain repeated for the
// chosen minutes with an optional bell between repetitions, then the closing.
// Framework-free: no Next, React or browser APIs, so a native app can use it.
//
// The server records the refrain once, as one more line after the script, and
// says where each line starts. The loop is built here, from that one clip, so
// minutes of repetition cost nothing extra to make.

/** Choices in minutes; 0 is off. Tim has not set these: an assumption on #77. */
export const REPEAT_MINUTES = [0, 1, 3, 5, 10, 20] as const;
export const MAX_REPEAT_MINUTES = 20;
export const DEFAULT_REPEAT_MINUTES = 0;

/** The silence after each repetition grows from the first value to the second over the session, so it settles. */
export const GAP_MS: readonly [number, number] = [3000, 6000];

export function clampMinutes(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(MAX_REPEAT_MINUTES, Math.round(v));
}

/** 16-bit mono PCM and its rate from a WAV file; null for anything else. */
export function parseWav(buf: ArrayBuffer): { rate: number; pcm: Int16Array } | null {
  if (buf.byteLength < 44) return null;
  const v = new DataView(buf);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let at = 12;
  let rate = 0;
  let mono16 = false;
  while (at + 8 <= buf.byteLength) {
    const id = tag(at);
    const size = v.getUint32(at + 4, true);
    if (id === "fmt ") {
      mono16 = v.getUint16(at + 8, true) === 1 && v.getUint16(at + 10, true) === 1 && v.getUint16(at + 22, true) === 16;
      rate = v.getUint32(at + 12, true);
    } else if (id === "data") {
      if (!mono16 || !rate) return null;
      const n = Math.floor(Math.min(size, buf.byteLength - at - 8) / 2);
      return { rate, pcm: new Int16Array(buf.slice(at + 8, at + 8 + n * 2)) };
    }
    at += 8 + size + (size % 2);
  }
  return null;
}

/** A WAV file of 16-bit mono PCM. */
export function toWav(pcm: Int16Array, rate: number): ArrayBuffer {
  const out = new ArrayBuffer(44 + pcm.byteLength);
  const v = new DataView(out);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + pcm.byteLength, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, pcm.byteLength, true);
  new Int16Array(out, 44).set(pcm);
  return out;
}

/** Linear resampling; good enough for a bell. */
export function resample(pcm: Int16Array, from: number, to: number): Int16Array {
  if (from === to) return pcm;
  const n = Math.max(1, Math.round((pcm.length * to) / from));
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * from) / to;
    const j = Math.floor(x);
    const a = pcm[Math.min(j, pcm.length - 1)];
    const b = pcm[Math.min(j + 1, pcm.length - 1)];
    out[i] = Math.round(a + (b - a) * (x - j));
  }
  return out;
}

/** The silence after repetition at `share` of the way through the loop (0 to 1), in ms. */
export function gapAt(share: number): number {
  const s = Math.min(1, Math.max(0, share));
  return Math.round(GAP_MS[0] + (GAP_MS[1] - GAP_MS[0]) * s);
}

export type Session = {
  pcm: Int16Array;
  rate: number;
  /** Lines in play order: the script body, the refrain, then the closing. */
  lines: string[];
  /** Where each of `lines` starts, as a share of the whole. */
  starts: number[];
  /** How many times the refrain is spoken. */
  repeats: number;
  /** The script alone (body and closing, no refrain), for saving. */
  script: Int16Array;
};

/**
 * Builds the session from one recording of [...script lines, refrain].
 * `starts` has one share per recorded line, so `starts.length` is
 * `scriptLines.length + 1`; the last script line is the closing.
 * Null when the starts do not fit the recording.
 */
export function buildSession(opts: {
  pcm: Int16Array;
  rate: number;
  starts: number[];
  scriptLines: string[];
  refrain: string;
  minutes: number;
  bell?: Int16Array | null;
}): Session | null {
  const { pcm, rate, starts, scriptLines, refrain } = opts;
  const n = scriptLines.length;
  if (n < 2 || starts.length !== n + 1) return null;
  const at = starts.map((s) => Math.round(s * pcm.length));
  for (let i = 1; i < at.length; i++) if (!(at[i] > at[i - 1])) return null;
  const closingAt = at[n - 1];
  const refrainAt = at[n];
  const body = pcm.subarray(0, closingAt);
  const closing = pcm.subarray(closingAt, refrainAt);
  const clip = pcm.subarray(refrainAt);
  if (clip.length < rate * 0.5) return null;

  // Plan the loop first, so the output is allocated once.
  const target = clampMinutes(opts.minutes) * 60 * rate;
  const gaps: number[] = [];
  let used = 0;
  while (target > 0 && used < target) {
    const gap = Math.round((gapAt(used / target) * rate) / 1000);
    gaps.push(gap);
    used += clip.length + gap;
  }
  const loopLen = used;
  const out = new Int16Array(body.length + loopLen + closing.length);
  out.set(body, 0);
  let w = body.length;
  for (const gap of gaps) {
    out.set(clip, w);
    w += clip.length;
    if (opts.bell?.length) {
      // The bell rings at the start of the silence. If the silence is shorter
      // than the bell, it fades out over its last 40 ms instead of clicking off.
      const len = Math.min(opts.bell.length, gap);
      out.set(opts.bell.subarray(0, len), w);
      if (len < opts.bell.length) {
        const fade = Math.min(len, Math.round(rate * 0.04));
        for (let i = 0; i < fade; i++) out[w + len - fade + i] = Math.round(out[w + len - fade + i] * (1 - (i + 1) / fade));
      }
    }
    w += gap;
  }
  out.set(closing, w);

  const total = out.length;
  const share = (i: number) => Math.round((i / total) * 10000) / 10000;
  const bodyStarts = at.slice(0, n - 1).map(share);
  const script = new Int16Array(body.length + closing.length);
  script.set(body, 0);
  script.set(closing, body.length);
  return {
    pcm: out,
    rate,
    lines: gaps.length ? [...scriptLines.slice(0, -1), refrain, scriptLines[n - 1]] : scriptLines,
    starts: gaps.length ? [...bodyStarts, share(body.length), share(body.length + loopLen)] : [...bodyStarts, share(body.length)],
    repeats: gaps.length,
    script,
  };
}
