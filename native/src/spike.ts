import { File, Paths } from "expo-file-system";
import { bell, renderRefrain, tone, wavFromPcm } from "@/lib/refrain";

export const RATE = 22050;

/** A stand-in refrain: three soft notes and a breath, 1.5 s. A real one is a spoken phrase. */
export function refrain(): Int16Array {
  const note = (f: number) => tone(f, 300, RATE, 0.35, 20);
  const breath = new Int16Array(Math.round(RATE * 0.6));
  const parts = [note(261.63), note(329.63), note(392), breath];
  const out = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function save(name: string, pcm: Int16Array): string {
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  f.create();
  f.write(wavFromPcm(pcm, RATE));
  return f.uri;
}

export type Mode = "loop" | "playlist" | "long";

/** The files one variant needs, and only those (the long file with the bell is about 12 MB). */
export function makeFiles(mode: Mode, repeats: number, withBell: boolean) {
  const r = refrain();
  const b = bell(RATE);
  if (mode === "long") {
    return { sources: [save(withBell ? "spike-long-bell.wav" : "spike-long.wav", renderRefrain({ refrain: r, rate: RATE, repeats, gapMs: 0, bell: withBell ? b : undefined }))] };
  }
  if (mode === "playlist") {
    // The playlist sequences the bell as its own track.
    return { sources: withBell ? [save("spike-refrain.wav", r), save("spike-bell.wav", b)] : [save("spike-refrain.wav", r)] };
  }
  // Loop flag: with the bell on, the bell follows the refrain inside the file, so the loop repeats both.
  const one = withBell ? renderRefrain({ refrain: r, rate: RATE, repeats: 2, gapMs: 0, bell: b }).slice(0, r.length + b.length) : r;
  return { sources: [save(withBell ? "spike-refrain-bell.wav" : "spike-refrain.wav", one)] };
}
