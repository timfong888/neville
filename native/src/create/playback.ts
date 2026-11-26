// Plays a Create result and reports the line being spoken. A recording plays through the
// audio seam, so it has the same background and lock-screen audio as the Player (#153).
// Without one, the device reads the script if it can speak, else the lines are shown in
// time; both of those need the app in the foreground.
import { type Made, lineAt } from "@/lib/create";
import { gapClip } from "@/lib/playerQueue";
import { LOOP_GAP_MS } from "../player/loop";
import { audio } from "../seams/audio";
import type { PlaySession, PlayState } from "../seams/types";

export type Events = {
  onLine(i: number): void; onEnd(): void; onError(message: string): void; onPlaying(playing: boolean): void;
  /** Something that will not stop playback now but may limit it, to show on screen. */
  onWarn?(message: string): void;
};
export type Playback = {
  stop(): void;
  /** False once it has ended, failed or been stopped. */
  active(): boolean;
  /** Continues after a pause that did not come from the screen: a call, the lock screen, another app. */
  resume(): void;
  /** True when the app leaving the foreground silences it, so the screen should stop it and say so. */
  foregroundOnly: boolean;
};

/** Optional: repeat the recording until stopped, and play a music track under it (#157, #163). */
export type PlayOptions = { loop?: boolean; music?: { src: string | number; volume: number } };

/** Starts playback. No event fires after `stop`. */
export function play(made: Made, ev: Events, opts: PlayOptions = {}): Playback {
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
    onPlaying: (p) => live && ev.onPlaying(p),
    onWarn: (m) => live && ev.onWarn?.(m),
  };
  let resume = () => {};
  if (made.recording) {
    const f = playFile(made, made.recording, guard, opts);
    end = f.stop;
    resume = f.resume;
  } else end = readAloud(made.lines, guard);
  // A start that already failed or ended has stopped; release what it made.
  if (!live) end();
  return { stop, active: () => live, resume: () => live && resume(), foregroundOnly: !made.recording };
}

function playFile(made: Made, rec: NonNullable<Made["recording"]>, ev: Events, opts: PlayOptions) {
  let session: PlaySession | null = null;
  let dead = false;
  // The first status updates are the load, not a pause: only a stop after playing began is reported.
  let started = false;
  const onState = (st: PlayState) => {
    if (dead) return;
    if (st.failed) return ev.onError("The recording could not be played.");
    if (st.ended) return ev.onEnd();
    if (st.playing) started = true;
    if (started) ev.onPlaying(st.playing);
    // Looping, the second clip is the pause between rounds: the lines follow only the recording.
    if (st.progress !== undefined && st.playing && (!opts.loop || st.index === 0)) ev.onLine(lineAt(rec.starts, st.progress));
  };
  void (async () => {
    try {
      // The player picks its decoder from the extension.
      const ext = /wav/.test(rec.mime) ? "wav" : /mp4|aac|m4a/.test(rec.mime) ? "m4a" : "mp3";
      const uri = await audio.save(`create.${ext}`, new Uint8Array(rec.audio), rec.mime);
      if (dead) return;
      // Normally done at launch; if that failed, try again so this plays as background audio too.
      // If it still fails the clip plays in the foreground only; say so instead of failing silently (#153).
      await audio.configure().catch(() => ev.onWarn?.("Background playback could not be switched on, so this may stop when you leave Neville."));
      if (dead) return;
      // A loop is the recording and a pause, again and again, so the first line follows the last by the same pause as in the Player.
      const clips = opts.loop ? [uri, await audio.save("create-gap.wav", gapClip(false, LOOP_GAP_MS), "audio/wav")] : [uri];
      if (dead) return;
      session = audio.open(clips, { title: made.title || "Neville", loop: opts.loop, music: opts.music, onState });
      session.play();
    } catch {
      if (!dead) ev.onError("The recording could not be played.");
    }
  })();
  return {
    stop() {
      dead = true;
      session?.stop();
      session = null;
    },
    resume: () => session?.play(),
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
