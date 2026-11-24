// How the affirmation is delivered: pace and tone presets, and the pure helpers
// that turn them into speech parameters and silences. Framework-free: no Next,
// React or browser APIs. The browser sends only a preset id; the server resolves
// it here, so a request cannot choose its own speed, pause or instruction.

export type PaceId = "brisk" | "slow" | "very-slow";
export type ToneId = "energetic" | "calm" | "soft" | "sleep";

export type Pace = {
  id: PaceId;
  label: string;
  /** Shown under the label in Settings. */
  note: string;
  /** Speed for models that take one. 1 is the model's normal pace. */
  speed: number;
  /** Silence between lines, in ms, for voices whose audio can be stitched. */
  pauseMs: number;
  /** Fits "Speak ___" in a style instruction. */
  style: string;
};

export type Tone = {
  id: ToneId;
  label: string;
  note: string;
  /** Multiplies the pace's speed. */
  speedFactor: number;
  /** Multiplies the pace's pause. */
  pauseFactor: number;
  /** A clause for the style instruction sent to models that take one. */
  style: string;
  /** Tells the script writer how the lines should feel. */
  scriptNote: string;
  /** "lifted" for Active: energy up instead of down. */
  energy?: "low" | "lifted";
};

export const PACES: readonly Pace[] = [
  {
    id: "brisk",
    label: "Brisk",
    note: "A natural, forward pace with short pauses. For Active mode.",
    speed: 1.05,
    pauseMs: 900,
    style: "at a brisk, natural pace",
  },
  {
    id: "slow",
    label: "Slow",
    note: "Unhurried, with a short pause after each line.",
    speed: 0.88,
    pauseMs: 1500,
    style: "slowly",
  },
  {
    id: "very-slow",
    label: "Very slow",
    note: "Each line has room to land. Long pauses.",
    speed: 0.75,
    pauseMs: 2600,
    style: "very slowly, with long pauses between phrases",
  },
];

export const TONES: readonly Tone[] = [
  {
    id: "energetic",
    label: "Energetic",
    note: "Grounded and quietly confident, like a calm coach walking beside you.",
    speedFactor: 1,
    pauseFactor: 0.8,
    // Tim's pick (#45): the "bright, encouraging" style read as an ad; this is the coach prompt he approved.
    style:
      "like a steady, quietly confident coach walking beside one person: grounded, warm, low and even in pitch, at a natural conversational pace",
    scriptNote: "Upbeat, confident and forward-moving. Short, strong lines about action and momentum. Still calm words, no exclamation marks.",
    energy: "lifted",
  },
  {
    id: "calm",
    label: "Calm",
    note: "Steady and warm, like a guide leading a meditation.",
    speedFactor: 1,
    pauseFactor: 1,
    style: "in a calm, warm, steady voice, like a trusted guide leading a meditation, low in energy and never announcing",
    scriptNote: "Steady, warm and grounded.",
  },
  {
    id: "soft",
    label: "Soft",
    note: "Close and quiet, as if speaking to one person beside you.",
    speedFactor: 0.97,
    pauseFactor: 1.2,
    style: "in a soft, close, intimate voice, almost a whisper, as if speaking quietly to one person beside you",
    scriptNote: "Gentle, close and intimate. Short, quiet lines.",
  },
  {
    id: "sleep",
    label: "Sleep",
    note: "Hushed and drowsy, for winding down at night.",
    speedFactor: 0.92,
    pauseFactor: 1.5,
    style: "in a hushed, drowsy, very gentle voice, as if helping someone drift off to sleep, letting each phrase trail off and settle",
    scriptNote: "Drowsy and restful. Lines about letting go, heaviness, warmth and safety.",
  },
];

export const DEFAULT_PACE_ID: PaceId = "slow";
export const DEFAULT_TONE_ID: ToneId = "calm";

/** The preset for a stored or requested id; an unknown id gives the default. */
export function resolvePace(id: unknown): Pace {
  return PACES.find((p) => p.id === id) ?? PACES.find((p) => p.id === DEFAULT_PACE_ID)!;
}

export function resolveTone(id: unknown): Tone {
  return TONES.find((t) => t.id === id) ?? TONES.find((t) => t.id === DEFAULT_TONE_ID)!;
}

/** Speed to ask the model for. Never so slow it slurs; only Brisk goes past normal, and not by much. */
export function speedFor(pace: Pace, tone: Tone): number {
  const s = Math.round(pace.speed * tone.speedFactor * 100) / 100;
  return Math.min(1.1, Math.max(0.6, s));
}

/** Silence between lines, in ms. */
export function pauseFor(pace: Pace, tone: Tone): number {
  return Math.round(pace.pauseMs * tone.pauseFactor);
}

/**
 * The style instruction for models that take one apart from the script. It is
 * never part of the spoken text, so it cannot be read aloud.
 */
export function styleInstruction(pace: Pace, tone: Tone): string {
  if (tone.energy === "lifted") {
    return (
      `Speak ${pace.style}, ${tone.style}. ` +
      "Use the present tense. Sound sure, but never shout and never sell: no salesy lift, no announcer voice, no smile in the voice, " +
      "and do not stress single words. Let your pitch settle at the end of each line, and leave a short pause after every line."
    );
  }
  return (
    `Speak ${pace.style}, ${tone.style}. ` +
    "Use the present tense and keep your energy low. Do not sound excited, and do not lean on or stress any word. " +
    "Let your pitch settle at the end of each line, and leave a pause after every line."
  );
}

// ---- Audio: 16-bit mono PCM ----

/** A response may carry about 4.5 MB on Vercel; stay under with room for headers. */
export const MAX_AUDIO_BYTES = 4_000_000;
const WAV_HEADER_BYTES = 44;

/** Silence of `ms` at `rate` Hz, as 16-bit mono PCM. */
export function silenceBytes(ms: number, rate: number): number {
  return Math.max(0, Math.round((rate * ms) / 1000)) * 2;
}

/**
 * The pause to use between `gaps` lines so the finished file fits the size a
 * response may carry. Longer than that and the pauses shrink first, down to
 * none if they must; speech itself is never cut. The size limit is a hard one,
 * so it wins over how long a pause ought to be.
 */
export function fitPause(opts: {
  pauseMs: number;
  gaps: number;
  speechBytes: number;
  rate: number;
  maxBytes?: number;
}): number {
  const { pauseMs, gaps, speechBytes, rate } = opts;
  if (gaps <= 0) return 0;
  const room = (opts.maxBytes ?? MAX_AUDIO_BYTES) - WAV_HEADER_BYTES - speechBytes;
  const want = silenceBytes(pauseMs, rate) * gaps;
  if (want <= room) return pauseMs;
  const msThatFit = ((room / gaps / 2) * 1000) / rate;
  return Math.max(0, Math.floor(msThatFit));
}

/** Joins PCM pieces with `pauseBytes` of silence between them. */
export function stitchPcm(chunks: ArrayBuffer[], pauseBytes: number): ArrayBuffer {
  const gaps = Math.max(0, chunks.length - 1);
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0) + gaps * pauseBytes);
  let at = 0;
  chunks.forEach((c, i) => {
    out.set(new Uint8Array(c), at);
    at += c.byteLength + (i < chunks.length - 1 ? pauseBytes : 0);
  });
  return out.buffer;
}

/** Where each piece starts, as a share of the whole, for the read-along. */
export function startShares(chunkBytes: number[], pauseBytes: number): number[] {
  const total = chunkBytes.reduce((n, b) => n + b, 0) + Math.max(0, chunkBytes.length - 1) * pauseBytes;
  if (total <= 0) return chunkBytes.map(() => 0);
  let at = 0;
  return chunkBytes.map((b) => {
    const start = at / total;
    at += b + pauseBytes;
    return Math.round(start * 10000) / 10000;
  });
}

/** Silent runs in 16-bit mono PCM as [first, end) sample indexes, each at least `minMs` long. */
export function silentRuns(pcm: Int16Array, rate: number, minMs = 250, threshold = 500): Array<[number, number]> {
  const win = Math.max(1, Math.floor(rate * 0.02));
  const out: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i < pcm.length; i += win) {
    let peak = 0;
    const end = Math.min(pcm.length, i + win);
    for (let j = i; j < end; j++) {
      const a = Math.abs(pcm[j]);
      if (a > peak) peak = a;
    }
    if (peak < threshold) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      if (((i - start) * 1000) / rate >= minMs) out.push([start, i]);
      start = -1;
    }
  }
  return out;
}

/**
 * Cuts one recording of `lines` lines into one piece per line, at the longest
 * silences: a voice told to pause between lines leaves its longest gaps there.
 * Each cut keeps a little of the silence on both sides so no word is clipped.
 * Null when there are not enough silences to cut at.
 */
export function splitAtPauses(
  pcm: ArrayBuffer,
  rate: number,
  lines: number,
  /** Characters per line, to check the cuts; leave out to skip the check. */
  lineChars?: number[],
): ArrayBuffer[] | null {
  const gaps = lines - 1;
  if (gaps <= 0) return [pcm];
  const samples = new Int16Array(pcm, 0, Math.floor(pcm.byteLength / 2));
  const runs = silentRuns(samples, rate)
    // Ignore leading and trailing silence: they are not between lines.
    .filter(([a, b]) => a > 0 && b < samples.length);
  if (runs.length < gaps) return null;
  const longest = [...runs].sort((x, y) => y[1] - y[0] - (x[1] - x[0])).slice(0, gaps).sort((x, y) => x[0] - y[0]);
  if (!lineChars || lineChars.length !== lines) return cutAt(pcm, rate, longest);
  // With the words per line, each cut is anchored where the words put that
  // line's end, counted in speech time: the longest silence near there. A
  // long breath inside another line is out of reach, and a pause the voice
  // under-honoured is still found. The pieces are then checked once more.
  const guided = guidedCuts(runs, samples.length, lineChars);
  if (!guided) return null;
  const pieces = cutAt(pcm, rate, guided);
  return piecesFitLines(pieces.map((p) => p.byteLength), lineChars) ? pieces : null;
}

/** Cuts `pcm` at the given silences, keeping a little silence on both sides of each cut. */
function cutAt(pcm: ArrayBuffer, rate: number, cuts: Array<[number, number]>): ArrayBuffer[] {
  const tail = Math.floor(rate * 0.12);
  const lead = Math.floor(rate * 0.06);
  const pieces: ArrayBuffer[] = [];
  let from = 0;
  for (const [a, b] of cuts) {
    pieces.push(pcm.slice(from * 2, Math.min(b, a + tail) * 2));
    from = Math.max(a, b - lead);
  }
  pieces.push(pcm.slice(from * 2));
  return pieces;
}

/**
 * One silence per line end. Where each line should end is worked out from its
 * share of the characters, counted in speech time (silences left out), so
 * breaths inside a line do not move the estimate. Among the silences within
 * reach of that point (about half a line), the best is the longest after a
 * penalty of twice its distance, so a long breath just out of place loses to
 * the real pause; with none in reach, the nearest.
 */
function guidedCuts(runs: Array<[number, number]>, total: number, lineChars: number[]): Array<[number, number]> | null {
  const silent = runs.reduce((n, [a, b]) => n + (b - a), 0);
  const speech = total - silent;
  if (speech <= 0) return null;
  // The sample at which `t` samples of speech have been heard.
  const sampleAt = (t: number): number => {
    let pos = 0;
    let heard = 0;
    for (const [a, b] of runs) {
      if (heard + (a - pos) >= t) return pos + (t - heard);
      heard += a - pos;
      pos = b;
    }
    return pos + (t - heard);
  };
  const chars = lineChars.reduce((n, c) => n + c, 0);
  const reach = (speech / lineChars.length) * 0.6;
  const out: Array<[number, number]> = [];
  let acc = 0;
  let after = 0;
  for (let i = 0; i < lineChars.length - 1; i++) {
    acc += lineChars[i];
    const expect = sampleAt((acc / chars) * speech);
    const left = runs.filter(([a]) => a >= after);
    if (!left.length) return null;
    // Distance from the expected line end to a silence: 0 if it falls inside it.
    const dist = ([a, b]: [number, number]) => (expect < a ? a - expect : expect > b ? expect - b : 0);
    const near = left.filter((r) => dist(r) <= reach);
    const pick = near.length
      ? near.reduce((x, y) => (y[1] - y[0] - 2 * dist(y) > x[1] - x[0] - 2 * dist(x) ? y : x))
      : left.reduce((x, y) => (dist(y) < dist(x) ? y : x));
    out.push(pick);
    after = pick[1];
  }
  return out;
}

/** True when each piece's share of the audio is roughly its line's share of the characters (0.45x to 2.2x). */
export function piecesFitLines(pieceBytes: number[], lineChars: number[]): boolean {
  const bytes = pieceBytes.reduce((n, b) => n + b, 0);
  const chars = lineChars.reduce((n, c) => n + c, 0);
  if (bytes <= 0 || chars <= 0) return false;
  return pieceBytes.every((b, i) => {
    const ratio = b / bytes / (Math.max(1, lineChars[i]) / chars);
    return ratio >= 0.45 && ratio <= 2.2;
  });
}
