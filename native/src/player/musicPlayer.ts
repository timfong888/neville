// The one background music player (#184). Framework-free; the platform's engine is passed in.
//
// The rule: at most one music player exists. Every change (a new track, Off, the session ending) removes
// the current player first, then makes the next. A load that finishes after a later change is released
// without playing: each change takes a new token, and only the newest token may keep what it loaded.
//
// The music has no start button of its own. It belongs to the voice session: it plays while the voice
// plays, pauses with it, and goes when the session ends. What to play comes from the stored choice,
// which the app feeds in through `setTarget`, so a change takes effect while the session runs.
import type { MusicChoice } from "@/lib/music";

/** What should be playing: a track, at the level it sits under the voice. */
export type Track = { id: Exclude<MusicChoice, "none">; src: string | number; volume: number };
/** One loaded player. `remove` stops and unloads it; nothing is called after it. */
export type MusicHandle = { play(): void; pause(): void; setVolume(v: number): void; remove(): void; /** Fade volume to 0 over `durationSec` s, then remove. When present, called instead of `remove` on natural session end. */ fade?(durationSec: number): void };
/** Loops the track. May finish late, or fail. */
export type MusicEngine = { load(src: string | number, volume: number): Promise<MusicHandle> };
/** A session's hold on the music. Calls from a session that has been replaced do nothing. */
export type Follower = { voice(playing: boolean): void; close(): void; /** Fade music to silence over `durationSec` seconds instead of an instant cut-off. */ fade(durationSec: number): void };
/** What is really there: the track that is loading or loaded ("none" if none), and whether a session holds the music. */
export type MusicView = { choice: MusicChoice; active: boolean };

export function makeMusicPlayer(engine: MusicEngine) {
  let target: Track | undefined;
  // `session` is a monotonically increasing counter used for follower identity comparisons.
  // It is never reset to 0, so each attach() yields a unique `mine` value and stale followers
  // from a previous close+reattach cycle cannot pass the `session !== mine` guard (#208).
  let session = 0;
  // True while a follower is live. Separate from `session` so the active-session check
  // (`session !== 0` in the original code) still works after the counter was never reset.
  let hasSession = false;
  let voice = false;
  /** Bumped by every change; a load keeps its result only if no change came after it started. */
  let token = 0;
  let loaded: { track: Track; h: MusicHandle; playing: boolean } | null = null;
  let loading: Track | null = null;
  /** Handle that is currently fading to silence after a natural session end. Cleared by release(). */
  let fading: MusicHandle | null = null;
  let snap: MusicView = { choice: "none", active: false };
  const subs = new Set<() => void>();

  const publish = () => {
    const choice: MusicChoice = loaded?.track.id ?? loading?.id ?? "none";
    const active = hasSession;
    if (choice === snap.choice && active === snap.active) return;
    snap = { choice, active };
    subs.forEach((f) => f());
  };
  const drop = (h: MusicHandle) => {
    try {
      h.remove();
    } catch {}
  };
  /** Stops and unloads whatever exists, and voids any load still on its way. Also cancels any in-progress fade. */
  const release = () => {
    token++;
    loading = null;
    if (loaded) drop(loaded.h);
    loaded = null;
    if (fading) { drop(fading); fading = null; }
  };
  const follow = () => {
    if (!loaded) return;
    const l = loaded;
    if (voice === l.playing) return;
    l.playing = voice;
    try {
      voice ? l.h.play() : l.h.pause();
    } catch {}
  };
  const sync = () => {
    const want = hasSession ? target : undefined;
    const have = loaded?.track ?? loading;
    if (want && have && have.id === want.id && have.src === want.src) {
      // The same track: only its level changes.
      if (loaded) {
        loaded.track = want;
        try {
          loaded.h.setVolume(want.volume);
        } catch {}
      } else loading = want;
      return publish();
    }
    release();
    if (want) {
      const mine = token;
      loading = want;
      let p: Promise<MusicHandle>;
      try {
        p = engine.load(want.src, want.volume);
      } catch (e) {
        p = Promise.reject(e);
      }
      p.then(
        (h) => {
          // Another change came first: this one never sounds.
          if (mine !== token || !loading) return drop(h);
          const track = loading;
          loading = null;
          loaded = { track, h, playing: false };
          if (track.volume !== want.volume) {
            try {
              h.setVolume(track.volume);
            } catch {}
          }
          follow();
          publish();
        },
        () => {
          if (mine !== token) return;
          loading = null;
          publish();
        },
      );
    }
    publish();
  };

  return {
    view: () => snap,
    subscribe(fn: () => void) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    /** What the stored choice says should play, or nothing. Takes effect at once if a session holds the music. */
    setTarget(t: Track | undefined) {
      target = t;
      sync();
    },
    /** A voice session takes the music. The one before it, if any, is let go first. */
    attach(): Follower {
      if (loaded || loading) console.warn("[music_double_attach]", { loaded: !!loaded, loading: !!loading });
      release();
      const mine = ++session;
      hasSession = true;
      voice = false;
      sync();
      return {
        voice(playing) {
          if (session !== mine) return;
          voice = playing;
          follow();
        },
        close() {
          if (session !== mine) return;
          hasSession = false;
          voice = false;
          release();
          publish();
        },
        fade(durationSec) {
          if (session !== mine) return;
          hasSession = false;
          voice = false;
          // Detach the handle from musicPlayer tracking immediately so observers see
          // no active session, but keep it in `fading` so release() can cancel it
          // if a new session starts before the fade completes.
          const h = loaded?.h ?? null;
          loaded = null;
          loading = null;
          token++;
          publish();
          if (!h) return;
          if (h.fade) {
            fading = h;
            h.fade(durationSec);
          } else {
            drop(h);
          }
        },
      };
    },
  };
}
