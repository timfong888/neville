// The phone's music engine (#184): one looping expo-audio player per load. The rules (one at a time, a late
// load never plays) live in player/musicPlayer.ts; this only makes and removes players.
import { createAudioPlayer } from "expo-audio";
import { type MusicEngine, makeMusicPlayer } from "../player/musicPlayer";

const engine: MusicEngine = {
  async load(src, volume) {
    const p = createAudioPlayer(src);
    p.loop = true;
    p.volume = volume;
    return {
      play: () => p.play(),
      pause: () => p.pause(),
      setVolume: (v) => void (p.volume = v),
      remove: () => p.remove(),
      fade(durationSec) {
        // If the platform player exposes a native fade hook (e.g. in tests), use it directly.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (typeof (p as any).fade === "function") { (p as any).fade(durationSec); return; }
        const steps = 10;
        const stepMs = (durationSec * 1000) / steps;
        const startVol = p.volume;
        for (let i = 1; i <= steps; i++) {
          // Fire-and-forget: no stored timer reference.
          setTimeout(() => { try { p.volume = startVol * (1 - i / steps); } catch {} }, i * stepMs);
        }
        setTimeout(() => { try { p.remove(); } catch {} }, durationSec * 1000 + stepMs);
      },
    };
  },
};

/** The only music player in the app. */
export const musicPlayer = makeMusicPlayer(engine);
