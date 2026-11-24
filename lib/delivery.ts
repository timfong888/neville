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
    scriptNote: "Upbeat, confident and forward-moving. Short, strong lines about what you are already doing, as the person who has it. Still calm words, no exclamation marks.",
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
    scriptNote: "Drowsy and restful. Lines about letting go, heaviness, warmth and rest.",
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
