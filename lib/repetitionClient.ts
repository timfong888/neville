// Browser-only: turns a recording with a refrain into a programming-mode
// session (#77): script, the refrain looped with an optional bell, closing.
import { buildSession, parseWav, resample, toWav } from "@/lib/repetition";

let bellCache: Promise<{ rate: number; pcm: Int16Array } | null> | null = null;

/** The bell, fetched once per page. Generated once by scripts/render-bell.py (CC0). */
function bell(): Promise<{ rate: number; pcm: Int16Array } | null> {
  bellCache ??= fetch("/sounds/bell.wav")
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((b) => (b ? parseWav(b) : null))
    .catch(() => null);
  return bellCache;
}

export type Composed = {
  url: string;
  lines: string[];
  starts: number[];
  /** The script alone, without the refrain or the loop: what Save keeps. */
  saveUrl: string;
  repeats: number;
};

/** Null when the recording cannot be cut apart (not 16-bit WAV, or starts that do not fit). */
export async function composeSession(opts: {
  audio: Blob;
  scriptLines: string[];
  starts: number[];
  refrain: string;
  minutes: number;
  bellOn: boolean;
}): Promise<Composed | null> {
  const wav = parseWav(await opts.audio.arrayBuffer());
  if (!wav) return null;
  const b = opts.bellOn ? await bell() : null;
  const s = buildSession({
    pcm: wav.pcm,
    rate: wav.rate,
    starts: opts.starts,
    scriptLines: opts.scriptLines,
    refrain: opts.refrain,
    minutes: opts.minutes,
    bell: b ? resample(b.pcm, b.rate, wav.rate) : null,
  });
  if (!s) return null;
  return {
    url: URL.createObjectURL(new Blob([toWav(s.pcm, s.rate)], { type: "audio/wav" })),
    lines: s.lines,
    starts: s.starts,
    saveUrl: URL.createObjectURL(new Blob([toWav(s.script, s.rate)], { type: "audio/wav" })),
    repeats: s.repeats,
  };
}

/**
 * The script alone, cut off before the refrain recorded after it, for when the
 * loop cannot be built. Null when the audio cannot be cut (not 16-bit WAV).
 */
export async function scriptOnly(audio: Blob, refrainStart: number): Promise<string | null> {
  const wav = parseWav(await audio.arrayBuffer());
  if (!wav || !(refrainStart > 0 && refrainStart < 1)) return null;
  const end = Math.round(refrainStart * wav.pcm.length);
  return URL.createObjectURL(new Blob([toWav(wav.pcm.subarray(0, end), wav.rate)], { type: "audio/wav" }));
}
