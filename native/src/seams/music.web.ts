// The browser's music engine (#184): one looping audio element per load. See music.native.ts.
import { type MusicEngine, makeMusicPlayer } from "../player/musicPlayer";

const engine: MusicEngine = {
  async load(src, volume) {
    if (typeof src !== "string") throw new Error("This track has no web address.");
    const a = new Audio();
    a.loop = true;
    a.volume = volume;
    a.src = src;
    return {
      play: () => void a.play().catch(() => undefined),
      pause: () => a.pause(),
      setVolume: (v) => void (a.volume = v),
      remove: () => {
        a.pause();
        a.removeAttribute("src");
      },
    };
  },
};

/** The only music player in the app. */
export const musicPlayer = makeMusicPlayer(engine);
