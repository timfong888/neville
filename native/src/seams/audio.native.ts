import { File, Paths } from "expo-file-system";
import { createAudioPlayer, createAudioPlaylist, setAudioModeAsync } from "expo-audio";
import type { AudioSeam } from "./types";

// Background playback and lock-screen controls need `doNotMix` (expo-audio docs).
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
  play(src, o) {
    const p = createAudioPlayer(src, { updateInterval: 250 });
    p.loop = !!o?.loop;
    p.setActiveForLockScreen(true, { title: o?.title ?? "Neville", artist: "Neville" }, { showSeekBackward: false, showSeekForward: false });
    p.play();
    return {
      stop() {
        p.pause();
        p.clearLockScreenControls();
        p.remove();
      },
    };
  },
  playSequence(srcs, o) {
    const l = createAudioPlaylist({ sources: srcs, loop: "all", updateInterval: 250 });
    l.setActiveForLockScreen(true, { title: o?.title ?? "Neville", artist: "Neville" });
    l.play();
    return {
      stop() {
        l.pause();
        l.clearLockScreenControls();
        l.destroy();
      },
    };
  },
};
