import { audio } from "./seams/audio";
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

const save = (name: string, pcm: Int16Array) => audio.save(name, wavFromPcm(pcm, RATE), "audio/wav");

/** The three ways to loop, as files the player can read. */
export async function makeFiles(repeats: number, withBell: boolean) {
  const r = refrain();
  const b = bell(RATE);
  return {
    // One refrain, plus the bell inside the file when it is on, so the loop flag repeats both.
    single: await save(withBell ? "spike-refrain-bell.wav" : "spike-refrain.wav", withBell ? renderRefrain({ refrain: r, rate: RATE, repeats: 2, gapMs: 0, bell: b }).slice(0, r.length + b.length) : r),
    // The refrain alone, for the playlist variant (which sequences the bell as its own track).
    refrainOnly: await save("spike-refrain.wav", r),
    // The bell alone, for the playlist variant.
    bell: await save("spike-bell.wav", b),
    // Every repeat (and the bell, if asked) rendered into one file.
    long: await save(withBell ? "spike-long-bell.wav" : "spike-long.wav", renderRefrain({ refrain: r, rate: RATE, repeats, gapMs: 0, bell: withBell ? b : undefined })),
  };
}
