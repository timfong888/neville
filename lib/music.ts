// Framework-free: no Next, React or browser APIs, so a native app can import it.
// The background music: bundled tracks, how loud they sit under the voice, and
// where to dip them while the voice speaks.

export type MusicId = "night-tide" | "morning-light" | "rise";
/** A track, or no music at all. */
export type MusicChoice = MusicId | "none";

export type MusicTrack = {
  id: MusicId;
  title: string;
  /** Shown under the title in Settings. */
  mood: string;
  /** Under /public. */
  src: string;
  /**
   * Loop points in seconds. Each file holds the loop with a second of
   * wrap-around on each side, so looping between these never clicks or gaps.
   * From scripts/render-music.py.
   */
  loopStart: number;
  loopEnd: number;
};

/** Every track is original to Neville and dedicated to the public domain. */
export const MUSIC_LICENSE = {
  name: "CC0 1.0 Universal (public domain dedication)",
  url: "https://creativecommons.org/publicdomain/zero/1.0/",
  source: "Composed and rendered for Neville by scripts/render-music.py. No samples or third-party recordings.",
} as const;

export const MUSIC_TRACKS: readonly MusicTrack[] = [
  {
    id: "night-tide",
    title: "Night Tide",
    mood: "Slow, low piano over distant surf. For sleep.",
    src: "/music/night-tide.mp3",
    loopStart: 1,
    loopEnd: 145,
  },
  {
    id: "morning-light",
    title: "Morning Light",
    mood: "Gentle piano arpeggios over a soft pad. Calm.",
    src: "/music/morning-light.mp3",
    loopStart: 1,
    loopEnd: 107.666667,
  },
  {
    id: "rise",
    title: "Rise",
    mood: "Bright plucked arpeggios with a light beat. Active.",
    src: "/music/rise.mp3",
    loopStart: 1,
    loopEnd: 74.846145,
  },
];

export const DEFAULT_MUSIC: MusicChoice = "morning-light";

export function resolveMusic(id: unknown): MusicChoice {
  if (id === "none") return "none";
  return MUSIC_TRACKS.find((t) => t.id === id)?.id ?? DEFAULT_MUSIC;
}

export function musicTrack(id: MusicChoice): MusicTrack | null {
  return MUSIC_TRACKS.find((t) => t.id === id) ?? null;
}

// ---- Levels

/** The slider's default position, 0 to 1. */
export const DEFAULT_MUSIC_VOLUME = 0.6;

/**
 * Gain for a slider position. The tracks average about -20.5 dBFS and
 * recordings are normalised near -20 dBFS (lib/loudness.ts). At the default
 * slider (0.6) the music sits about 10 dB under the voice between lines and
 * about 16 dB under it while the voice speaks: clearly there on a phone
 * speaker, never competing. The top of the slider is about 2 dB under between
 * lines. 0 is silent. (The first curve sat about 30 dB under the voice at the
 * default, which a phone speaker does not reproduce: #52.)
 */
export function musicGain(volume: number): number {
  const v = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : DEFAULT_MUSIC_VOLUME));
  if (v === 0) return 0;
  const db = -2 - (1 - v) * 20;
  return Math.round(10 ** (db / 20) * 10000) / 10000;
}

/** How far the music dips while the voice speaks, as a gain. -6 dB. */
export const DUCK_GAIN = 0.5;

// ---- Where the voice speaks

export type Segment = { start: number; end: number };

/**
 * Stretches of speech in a recording, from its loudness every `hop` seconds.
 * A frame counts as speech when it is within 35 dB of the loudest frame (and
 * not near digital silence). Gaps shorter than `bridge` seconds are joined so
 * the music does not pump between words; blips shorter than `minSpeech` go.
 */
export function speechSegments(
  rms: ArrayLike<number>,
  hop: number,
  opts: { bridge?: number; minSpeech?: number } = {},
): Segment[] {
  const bridge = opts.bridge ?? 0.6;
  const minSpeech = opts.minSpeech ?? 0.15;
  let peak = 0;
  for (let i = 0; i < rms.length; i++) peak = Math.max(peak, rms[i]);
  if (peak <= 0) return [];
  const threshold = Math.max(peak * 10 ** (-35 / 20), 1e-4);
  const out: Segment[] = [];
  let start = -1;
  for (let i = 0; i <= rms.length; i++) {
    const on = i < rms.length && rms[i] >= threshold;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      out.push({ start: start * hop, end: i * hop });
      start = -1;
    }
  }
  const joined: Segment[] = [];
  for (const s of out) {
    const last = joined[joined.length - 1];
    if (last && s.start - last.end < bridge) last.end = s.end;
    else joined.push({ ...s });
  }
  return joined
    .filter((s) => s.end - s.start >= minSpeech)
    .map((s) => ({ start: round3(s.start), end: round3(s.end) }));
}

/** RMS of 16-bit or float samples every `hop` seconds. */
export function rmsFrames(samples: ArrayLike<number>, rate: number, hop = 0.05): Float32Array {
  const size = Math.max(1, Math.round(rate * hop));
  const n = Math.ceil(samples.length / size);
  const out = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let sum = 0;
    const end = Math.min(samples.length, (f + 1) * size);
    for (let i = f * size; i < end; i++) sum += samples[i] * samples[i];
    out[f] = Math.sqrt(sum / Math.max(1, end - f * size));
  }
  return out;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
