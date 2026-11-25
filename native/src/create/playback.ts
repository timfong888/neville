// Plays a Create result and reports the line being spoken. A recording plays through
// expo-audio on both platforms. Without one, the device reads the script if it can speak,
// else the lines are shown in time. Background audio and the lock screen belong to the Player.
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { type Made, lineAt } from "@/lib/create";
import { audioFile } from "./audioFile";

export type Events = { onLine(i: number): void; onEnd(): void; onError(message: string): void };

/** Starts playback; the returned function stops it. No event fires after a stop. */
export function play(made: Made, ev: Events): () => void {
  let live = true;
  // Set before the player starts: a player that fails at once reports through `guard` straight away.
  let end: () => void = () => undefined;
  const stop = () => {
    live = false;
    end();
  };
  const guard: Events = {
    onLine: (i) => live && ev.onLine(i),
    onEnd: () => live && (stop(), ev.onEnd()),
    onError: (m) => live && (stop(), ev.onError(m)),
  };
  end = made.recording ? playFile(made.recording, guard) : readAloud(made.lines, guard);
  // A start that already failed or ended has stopped; release what it made.
  if (!live) end();
  return stop;
}

function playFile(rec: NonNullable<Made["recording"]>, ev: Events): () => void {
  let file: ReturnType<typeof audioFile> | null = null;
  let player: ReturnType<typeof createAudioPlayer> | null = null;
  try {
    file = audioFile(rec.audio, rec.mime);
    // Without this an iPhone's silent switch mutes the recording.
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
    player = createAudioPlayer(file.uri, { updateInterval: 200 });
    player.addListener("playbackStatusUpdate", (st) => {
      if (st.didJustFinish) ev.onEnd();
      else if (st.duration > 0) ev.onLine(lineAt(rec.starts, st.currentTime / st.duration));
    });
    player.play();
  } catch {
    ev.onError("The recording could not be played.");
  }
  return () => {
    try {
      player?.pause();
      player?.remove();
    } catch {
      /* already released */
    }
    file?.release();
  };
}

type Synth = { speak(u: unknown): void; cancel(): void };
type Utterance = { rate: number; pitch: number; onstart: (() => void) | null; onend: (() => void) | null; onerror: ((e: { error?: string }) => void) | null };

function readAloud(lines: string[], ev: Events): () => void {
  const g = globalThis as { speechSynthesis?: Synth; SpeechSynthesisUtterance?: new (text: string) => Utterance };
  const timers: ReturnType<typeof setTimeout>[] = [];
  // No working speech engine: step through the lines on a timer instead.
  const inTime = (from: number) => {
    let at = 0;
    lines.slice(from).forEach((l, i) => {
      timers.push(setTimeout(() => ev.onLine(from + i), at));
      at += 1200 + l.length * 70;
    });
    timers.push(setTimeout(ev.onEnd, at));
  };
  const synth = g.speechSynthesis;
  const Utter = g.SpeechSynthesisUtterance;
  if (!synth || !Utter) inTime(0);
  else {
    let failed = false;
    synth.cancel();
    // All lines are queued inside the tap: mobile browsers only speak from a user gesture.
    lines.forEach((text, i) => {
      const u = new Utter(text);
      u.rate = 0.82;
      u.pitch = 0.95;
      u.onstart = () => ev.onLine(i);
      if (i === lines.length - 1) u.onend = ev.onEnd;
      u.onerror = (e) => {
        // cancel() reports these two; anything else means the engine failed. Fall back once.
        if (failed || e.error === "canceled" || e.error === "interrupted") return;
        failed = true;
        synth.cancel();
        inTime(i);
      };
      synth.speak(u);
    });
  }
  return () => {
    timers.forEach(clearTimeout);
    synth?.cancel();
  };
}
