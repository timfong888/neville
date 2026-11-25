// Plays a voice's pre-made sample, one at a time. Same behaviour as the Settings screen's Play buttons.
import { useCallback, useEffect, useRef, useState } from "react";
import { type AudioPlayer, createAudioPlayer } from "expo-audio";
import { API_URL } from "../config";

export function useSample() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState("");
  const player = useRef<AudioPlayer | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (watchdog.current) clearTimeout(watchdog.current);
    watchdog.current = null;
    try {
      player.current?.pause();
      player.current?.remove();
    } catch {
      /* already released */
    }
    player.current = null;
    setPlaying(null);
  }, []);
  useEffect(() => stop, [stop]);

  /** Starts the sample for `id`, or stops it when it is the one playing. */
  const toggle = (id: string, sample: string) => {
    if (playing === id) return stop();
    stop();
    const fail = () => {
      stop();
      setError("That sample could not be played.");
    };
    try {
      const p = createAudioPlayer(`${API_URL}${sample}`);
      player.current = p;
      let loaded = false;
      p.addListener("playbackStatusUpdate", (st) => {
        if (player.current !== p) return;
        // A missing or broken file reports later, not as a thrown error: web sends `error`, iOS a failed state.
        if ((st as { error?: string }).error || st.playbackState === "failed") return fail();
        if (st.isLoaded) loaded = true;
        if (st.didJustFinish) stop();
      });
      // No network gives no event at all, so give up after a while.
      watchdog.current = setTimeout(() => player.current === p && !loaded && fail(), 10000);
      p.play();
      setPlaying(id);
      setError("");
    } catch {
      fail();
    }
  };
  return { playing, error, toggle, stop };
}
