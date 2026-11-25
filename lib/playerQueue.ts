// Framework-free: no Next, React or browser APIs. The Player's session for one
// saved item (#122): the recording, then the recording again for the chosen
// minutes, with silence and an optional bell between plays.
//
// The session is a flat list of clips. Nothing waits on a timer between clips,
// so it keeps going with the phone locked.
import { bell, wavFromPcm } from "@/lib/refrain";

/** Silence between two plays of the recording. The bell (1.8 s) fits inside it. */
export const GAP_MS = 3000;
export const GAP_RATE = 22050;
/** Used when the player cannot tell how long the recording is. */
export const FALLBACK_VOICE_SECONDS = 30;
/** A very short recording must not make a queue of hundreds of clips. */
export const MAX_REPEATS = 120;

/** How many times the recording plays again after the first play. */
export function repeatsFor(voiceSeconds: number, minutes: number, gapMs = GAP_MS): number {
  if (!(minutes > 0)) return 0;
  const voice = Number.isFinite(voiceSeconds) && voiceSeconds > 0 ? voiceSeconds : FALLBACK_VOICE_SECONDS;
  const round = voice + gapMs / 1000;
  return Math.min(MAX_REPEATS, Math.max(1, Math.ceil((minutes * 60) / round)));
}

/** The gap clip as a WAV file: silence, with the bell at its start when it is on. */
export function gapClip(bellOn: boolean, gapMs = GAP_MS, rate = GAP_RATE): Uint8Array {
  const pcm = new Int16Array(Math.max(1, Math.round((rate * gapMs) / 1000)));
  if (bellOn) {
    const b = bell(rate);
    pcm.set(b.subarray(0, Math.min(b.length, pcm.length)));
  }
  return wavFromPcm(pcm, rate);
}

/** The clips in play order: voice, gap, voice, ... ending on the voice. */
export function buildQueue<T>(voice: T, gap: T, repeats: number): T[] {
  const out: T[] = [voice];
  for (let i = 0; i < Math.max(0, repeats); i++) out.push(gap, voice);
  return out;
}

/** Which play of the recording a queue position belongs to (1 is the first), and whether it is the gap after it. */
export function roundAt(index: number): { round: number; inGap: boolean } {
  const i = Math.max(0, index);
  return { round: Math.floor(i / 2) + 1, inGap: i % 2 === 1 };
}
