import type { Manifestation } from "@/lib/library/model";
import { tone, wavFromPcm } from "@/lib/refrain";
import { audio } from "../seams/audio";

export const DEMO_ID = "demo";

/** A built-in item (`/player/demo`). It tests the lock screen while the library is empty. */
export const demoItem: Manifestation = {
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

/** Its recording: five notes, 4.5 seconds, written where the audio seam can play it. */
export function demoAudioUri(): Promise<string> {
  const rate = 22050;
  const notes = [261.63, 329.63, 392, 329.63, 261.63].map((f) => tone(f, 900, rate, 0.3, 60));
  const pcm = new Int16Array(notes.reduce((n, p) => n + p.length, 0));
  notes.reduce((at, p) => (pcm.set(p, at), at + p.length), 0);
  return audio.save("player-demo.wav", wavFromPcm(pcm, rate), "audio/wav");
}
