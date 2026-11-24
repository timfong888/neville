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

/** The three ways to loop, as files on disk. */
export function makeFiles(repeats: number, withBell: boolean) {
  const r = refrain();
  const b = bell(RATE);
  return {
    // One refrain. Looping is left to the player.
    // With the bell on, the bell follows the refrain inside the file, so the loop flag repeats both.
    single: save(withBell ? "spike-refrain-bell.wav" : "spike-refrain.wav", withBell ? renderRefrain({ refrain: r, rate: RATE, repeats: 2, gapMs: 0, bell: b }).slice(0, r.length + b.length) : r),
    // The refrain alone, and the bell alone, for the playlist variant.
    refrainOnly: save("spike-refrain.wav", r),
    bell: save("spike-bell.wav", b),
    // Every repeat (and the bell, if asked) rendered into one file.
    long: save(withBell ? "spike-long-bell.wav" : "spike-long.wav", renderRefrain({ refrain: r, rate: RATE, repeats, gapMs: 0, bell: withBell ? b : undefined })),
  };
}
