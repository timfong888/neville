import { File, Paths } from "expo-file-system";
import { createAudioPlayer, createAudioPlaylist, setAudioModeAsync } from "expo-audio";
import type { AudioSeam } from "./types";

const ARTIST = "Neville";

// expo-audio, as proved in the spike (#85): background playback and lock-screen
// controls need `doNotMix`, and the playlist sequences clips natively.
export const audio: AudioSeam = {
  async configure() {
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" });
  },
  async save(name, bytes) {
    const f = new File(Paths.cache, name);
    if (f.exists) f.delete();
    f.create();
    f.write(bytes);
    return f.uri;
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
    const list = createAudioPlaylist({ sources: srcs, loop: "none", updateInterval: 500 });
    list.setActiveForLockScreen(true, { title: o.title, artist: ARTIST }, { showSeekBackward: false, showSeekForward: false });
    const sub = list.addListener("playlistStatusUpdate", (s) =>
      o.onState({ playing: s.playing, index: s.currentIndex, ended: s.didJustFinish && s.currentIndex >= s.trackCount - 1 }),
    );
    let open = true;
    return {
      play: () => open && list.play(),
      pause: () => open && list.pause(),
      stop() {
        if (!open) return;
        open = false;
        sub.remove();
        try {
          list.pause();
          list.clearLockScreenControls();
          list.destroy();
        } catch {}
      },
    };
  },
};
