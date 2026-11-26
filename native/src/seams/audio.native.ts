import { File, Paths } from "expo-file-system";
import { createAudioPlayer, createAudioPlaylist, setAudioModeAsync } from "expo-audio";
import type { AudioSeam, PlaySession } from "./types";

const ARTIST = "Neville";
/** How long a local clip may take to load before the session is reported as failed. */
const LOAD_TIMEOUT_MS = 8000;

// expo-audio, as proved in the spike (#85): background playback and lock-screen
// controls need `doNotMix`, and the playlist sequences clips natively.
// `setAudioModeAsync` sets the whole mode, so this is the only place that calls it (#153).
export const AUDIO_MODE = { playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" } as const;
let configured: Promise<void> | null = null;

// Ends the open session. One at a time: a new session ends the one before it.
let current: (() => void) | null = null;

export const audio: AudioSeam = {
  // Once per launch; a failure is not remembered, so the next call tries again.
  configure() {
    configured ??= setAudioModeAsync(AUDIO_MODE).catch((e) => {
      configured = null;
      throw e;
    });
    return configured;
  },
  async save(name, bytes) {
    const f = new File(Paths.cache, name);
    if (f.exists) f.delete();
    f.create();
    f.write(bytes);
    return f.uri;
  },
  // A recording on the phone is a file that stays readable while the Player is open, so no copy is made.
  async keep(_name, src) {
    return src;
  },
  async duration(src) {
    const p = createAudioPlayer(src);
    try {
      for (let i = 0; i < 40 && !p.isLoaded; i++) await new Promise((r) => setTimeout(r, 50));
      return Number.isFinite(p.duration) ? p.duration : 0;
    } catch {
      return 0;
    } finally {
      p.remove();
    }
  },
  open(srcs, o) {
    current?.();
    const list = createAudioPlaylist({ sources: srcs, loop: o.loop ? "all" : "none", updateInterval: 500 });
    const meta = { title: o.title, artist: ARTIST };
    const opts = { showSeekBackward: false, showSeekForward: false };
    list.setActiveForLockScreen(true, meta, opts);
    // Now Playing is only taken up once the audio session is running, which is after Play. Say it again then.
    let announced = false;
    // The playlist status has no error field. A clip that cannot be loaded or decoded
    // never reports isLoaded, so a session that has not loaded this long after Play has failed.
    let open = true;
    let loaded = false;
    let watch: ReturnType<typeof setTimeout> | null = null;
    const sub = list.addListener("playlistStatusUpdate", (s) => {
      if (s.isLoaded || s.playing) loaded = true;
      if (s.playing && !announced && open) {
        announced = true;
        try {
          list.setActiveForLockScreen(true, meta, opts);
        } catch {}
      }
      const progress = s.duration > 0 && Number.isFinite(s.currentTime) ? Math.min(1, s.currentTime / s.duration) : undefined;
      o.onState({ playing: s.playing, index: s.currentIndex, ended: !o.loop && s.didJustFinish && s.currentIndex >= s.trackCount - 1, progress });
    });
    const guard = () => {
      if (loaded || watch) return;
      watch = setTimeout(() => {
        // Cleared so a second Play on the same session is watched again.
        watch = null;
        if (!open || loaded) return;
        // Paused first, so a clip that loads late cannot start after the failure was reported.
        try {
          list.pause();
        } catch {}
        o.onState({ playing: false, index: list.currentIndex, ended: false, failed: true });
      }, LOAD_TIMEOUT_MS);
    };
    const session: PlaySession = {
      play() {
        if (!open) return;
        list.play();
        guard();
      },
      pause: () => void (open && list.pause()),
      stop() {
        if (!open) return;
        open = false;
        if (current === end) current = null;
        if (watch) clearTimeout(watch);
        sub.remove();
        try {
          list.pause();
          list.clearLockScreenControls();
          list.destroy();
        } catch {}
      },
    };
    const end = () => {
      if (open) o.onState({ playing: false, index: list.currentIndex, ended: true, replaced: true });
      session.stop();
    };
    current = end;
    return session;
  },
};
