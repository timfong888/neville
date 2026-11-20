// Framework-free: no Next, React or browser APIs. The order a playlist plays in
// and what comes next, plus the silence played between tracks.

export type Repeat = "off" | "all" | "one";
export const REPEATS: readonly Repeat[] = ["off", "all", "one"];

/** Silence between two manifestations, in ms, when the mode does not say. */
export const DEFAULT_GAP_MS = 2500;

/**
 * Track indexes in the order they will play. Shuffled keeps `first` at the
 * front (the track the person tapped) and shuffles the rest.
 */
export function playOrder(n: number, shuffle: boolean, first = 0, random: () => number = Math.random): number[] {
  const all = Array.from({ length: n }, (_, i) => i);
  if (!shuffle || n < 2) return all;
  const start = Math.min(Math.max(0, first), n - 1);
  const rest = all.filter((i) => i !== start);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [start, ...rest];
}

/** The position after `pos` when a track ends by itself; -1 means stop. */
export function nextPos(pos: number, length: number, repeat: Repeat): number {
  if (length <= 0) return -1;
  if (repeat === "one") return pos;
  if (pos + 1 < length) return pos + 1;
  return repeat === "all" ? 0 : -1;
}

/** The position for a "next" tap: like the end of a track, but never stays on the same one. */
export function skipPos(pos: number, length: number, repeat: Repeat): number {
  return nextPos(pos, length, repeat === "one" ? "all" : repeat);
}

/** The position for a "previous" tap: restart the track if it is more than 3 s in. */
export function backPos(pos: number, length: number, secondsIn: number, repeat: Repeat): number {
  if (secondsIn > 3 || length <= 1) return pos;
  if (pos > 0) return pos - 1;
  return repeat === "all" ? length - 1 : 0;
}

/** A WAV file of silence, `ms` long: 8 kHz mono 16-bit, about 16 KB a second. */
export function silenceWav(ms: number, rate = 8000): ArrayBuffer {
  const samples = Math.max(1, Math.round((rate * Math.max(0, ms)) / 1000));
  const bytes = samples * 2;
  const buf = new ArrayBuffer(44 + bytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + bytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, bytes, true);
  return buf;
}
