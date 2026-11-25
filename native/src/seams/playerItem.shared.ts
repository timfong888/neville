import type { Manifestation } from "@/lib/library/model";
import { tone, wavFromPcm } from "@/lib/refrain";

/** One saved item, ready to play. `audio` is an address the audio seam can open, or null with no recording. */
export type PlayerItem = { item: Manifestation; audio: { bytes: Uint8Array; mime: string } | string | null };

export const DEMO_ID = "demo";

/** A built-in item (`/player/demo`): three notes, about 5 seconds. It tests the lock screen with an empty library. */
export function demoItem(): PlayerItem {
  const rate = 22050;
  const notes = [261.63, 329.63, 392, 329.63, 261.63].map((f) => tone(f, 900, rate, 0.3, 60));
  const pcm = new Int16Array(notes.reduce((n, p) => n + p.length, 0));
  notes.reduce((at, p) => (pcm.set(p, at), at + p.length), 0);
  const item: Manifestation = {
    id: DEMO_ID,
    title: "Player test tone",
    want: "",
    firstName: "",
    lines: ["Five soft notes stand in for a recording.", "Choose minutes of repetition, press Play, then lock the phone."],
    voiceId: "",
    voiceName: "Test tone",
    hasAudio: true,
    createdAt: 0,
    updatedAt: 0,
  };
  return { item, audio: { bytes: wavFromPcm(pcm, rate), mime: "audio/wav" } };
}
