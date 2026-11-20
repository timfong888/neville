// Framework-free: evens out the loudness of a recording so every voice and
// every track plays at the same level, with headroom for the music under it.

/** Speech loudness every recording is brought to: RMS of voiced frames, dBFS. */
export const TARGET_SPEECH_DB = -20;
/** No sample may go above this, dBFS. */
export const PEAK_CEILING_DB = -1;
/** Limits on the correction, so a near-silent or broken file is not blown up. */
const MAX_BOOST_DB = 18;
const MAX_CUT_DB = -18;

const FRAME_S = 0.02;

/** Loudness of the voiced part of 16-bit mono PCM: frames within 30 dB of the loudest, dBFS. */
export function speechLoudness(pcm: ArrayBuffer, rate: number): { rmsDb: number; peakDb: number } {
  const s = new Int16Array(pcm, 0, Math.floor(pcm.byteLength / 2));
  const size = Math.max(1, Math.round(rate * FRAME_S));
  const frames: number[] = [];
  let peak = 0;
  for (let f = 0; f * size < s.length; f++) {
    let sum = 0;
    const end = Math.min(s.length, (f + 1) * size);
    for (let i = f * size; i < end; i++) {
      const v = s[i] / 32768;
      sum += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    frames.push(sum / (end - f * size));
  }
  const loudest = Math.max(0, ...frames);
  if (loudest <= 0) return { rmsDb: -Infinity, peakDb: -Infinity };
  const floor = loudest * 10 ** (-30 / 10); // frames are mean squares, so /10
  const voiced = frames.filter((x) => x >= floor && x > 1e-9);
  const mean = voiced.reduce((n, x) => n + x, 0) / voiced.length;
  return { rmsDb: 10 * Math.log10(mean), peakDb: 20 * Math.log10(peak) };
}

/** The gain, in dB, that brings speech to the target without passing the peak ceiling. */
export function normalizeGainDb(rmsDb: number, peakDb: number): number {
  if (!Number.isFinite(rmsDb)) return 0;
  let g = TARGET_SPEECH_DB - rmsDb;
  g = Math.min(g, PEAK_CEILING_DB - peakDb);
  return Math.max(MAX_CUT_DB, Math.min(MAX_BOOST_DB, g));
}

/** 16-bit mono PCM brought to the target loudness. Silence stays silent. */
export function normalizePcm16(pcm: ArrayBuffer, rate: number): ArrayBuffer {
  const { rmsDb, peakDb } = speechLoudness(pcm, rate);
  const g = 10 ** (normalizeGainDb(rmsDb, peakDb) / 20);
  const src = new Int16Array(pcm, 0, Math.floor(pcm.byteLength / 2));
  const out = new Int16Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(src[i] * g)));
  return out.buffer;
}
