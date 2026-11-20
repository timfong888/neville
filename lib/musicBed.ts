// Browser-only: plays the background music under the voice with Web Audio.
//
// Why Web Audio and not an <audio> element: iPhone Safari ignores an element's
// volume, so a slider and ducking need a gain node, and an element's loop
// leaves a gap at the seam while a buffer loops sample-exact.
//
// The voice itself stays in a plain <audio> element (it drives the lock-screen
// controls and keeps playing when the screen is off). Ducking is scheduled on
// the audio clock from the recording's own speech segments, so it needs no
// timers while the screen is off.
import { DUCK_GAIN, musicGain, musicTrack, rmsFrames, speechSegments, type MusicChoice, type Segment } from "@/lib/music";

type Ctx = AudioContext;

let shared: Ctx | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const fetched = new Map<string, Promise<ArrayBuffer | null>>();

/** The one AudioContext. Create it inside a tap so mobile browsers let it play. */
export function audioContext(): Ctx | null {
  if (shared) return shared;
  const C: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  // Safari 16.4+: mark this page as media playback, so it may keep playing in the background.
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (session) {
    try {
      session.type = "playback";
    } catch {
      /* older Safari */
    }
  }
  shared = new C();
  return shared;
}

/** Starts downloading a track early so Play starts the music at once. */
export function prefetchMusic(id: MusicChoice): void {
  const t = musicTrack(id);
  if (!t || fetched.has(t.src)) return;
  fetched.set(
    t.src,
    fetch(t.src)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null),
  );
}

function decoded(ctx: Ctx, id: MusicChoice): Promise<AudioBuffer | null> {
  const t = musicTrack(id);
  if (!t) return Promise.resolve(null);
  const hit = buffers.get(t.src);
  if (hit) return hit;
  prefetchMusic(id);
  const p = fetched.get(t.src)!.then(async (data) => {
    if (!data) return null;
    try {
      // decodeAudioData detaches its input; keep the download for a retry.
      return await ctx.decodeAudioData(data.slice(0));
    } catch {
      return null;
    }
  });
  buffers.set(t.src, p);
  return p;
}

/** Where the voice speaks in a recording, from its own audio. Empty if it cannot be read. */
export async function speechOf(blob: Blob): Promise<Segment[]> {
  const ctx = audioContext();
  if (!ctx) return [];
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const hop = 0.05;
    return speechSegments(rmsFrames(buf.getChannelData(0), buf.sampleRate, hop), hop);
  } catch {
    return [];
  }
}

/** The music under one listening session. */
export class MusicBed {
  private ctx: Ctx | null;
  private src: AudioBufferSourceNode | null = null;
  private volume: GainNode | null = null;
  private duck: GainNode | null = null;
  private fade: GainNode | null = null;
  private stopped = false;

  /** Call inside the tap that starts playback. */
  constructor() {
    this.ctx = audioContext();
    if (this.ctx?.state !== "running") void this.ctx?.resume().catch(() => {});
  }

  /** Starts `id` looping at `volume` (0 to 1), fading in over two seconds. */
  async start(id: MusicChoice, volume: number): Promise<void> {
    const ctx = this.ctx;
    const t = musicTrack(id);
    if (!ctx || !t) return;
    this.volume = new GainNode(ctx, { gain: musicGain(volume) });
    this.duck = new GainNode(ctx, { gain: 1 });
    this.fade = new GainNode(ctx, { gain: 0 });
    this.volume.connect(this.duck).connect(this.fade).connect(ctx.destination);
    const buf = await decoded(ctx, id);
    if (!buf || this.stopped) return;
    const src = new AudioBufferSourceNode(ctx, { buffer: buf, loop: true, loopStart: t.loopStart, loopEnd: t.loopEnd });
    src.connect(this.volume);
    src.start(ctx.currentTime + 0.05, t.loopStart);
    this.fade.gain.setValueAtTime(0, ctx.currentTime);
    this.fade.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    this.src = src;
  }

  setVolume(volume: number): void {
    if (this.ctx && this.volume) this.volume.gain.setTargetAtTime(musicGain(volume), this.ctx.currentTime, 0.08);
  }

  /** Dips the music under each segment. `voiceAt` is the voice's current time; segments are in its timeline. */
  duckFor(segments: Segment[], voiceAt: number): void {
    const ctx = this.ctx;
    const g = this.duck?.gain;
    if (!ctx || !g) return;
    const now = ctx.currentTime;
    const offset = now - voiceAt;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    for (const s of segments) {
      const down = offset + s.start - 0.25;
      const up = offset + s.end + 0.15;
      if (up <= now) continue;
      g.setTargetAtTime(DUCK_GAIN, Math.max(now, down), 0.08);
      g.setTargetAtTime(1, Math.max(now, up), 0.35);
    }
  }

  /** Dips the music for as long as the voice is speaking, when its segments are not known. */
  holdDuck(on: boolean): void {
    const ctx = this.ctx;
    const g = this.duck?.gain;
    if (!ctx || !g) return;
    g.cancelScheduledValues(ctx.currentTime);
    g.setTargetAtTime(on ? DUCK_GAIN : 1, ctx.currentTime, on ? 0.08 : 0.35);
  }

  /** Fades everything this bed plays to silence over `seconds`. */
  fadeOut(seconds: number): void {
    const ctx = this.ctx;
    const g = this.fade?.gain;
    if (!ctx || !g) return;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(0, ctx.currentTime + seconds);
  }

  stop(): void {
    this.stopped = true;
    const ctx = this.ctx;
    if (!ctx) return;
    this.fadeOut(0.6);
    const src = this.src;
    const nodes = [this.volume, this.duck, this.fade];
    setTimeout(() => {
      try {
        src?.stop();
      } catch {
        /* already stopped */
      }
      nodes.forEach((n) => n?.disconnect());
    }, 700);
    this.src = null;
  }
}
