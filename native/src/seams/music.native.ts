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
    };
  },
};

/** The only music player in the app. */
export const musicPlayer = makeMusicPlayer(engine);
