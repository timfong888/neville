// One voice sample at a time, played through the audio seam so it follows the same audio mode as
// everything else (#153). The hook and the Settings screen share it; it holds no React state.
import { audio } from "../seams/audio";
import type { PlaySession } from "../seams/types";

export type SampleEvents = {
  /** The sample now playing, or null once nothing is. */
  onPlaying(id: string | null): void;
  onError(message: string): void;
};

export function createSamples(ev: SampleEvents) {
  let session: PlaySession | null = null;
  let current: string | null = null;

  const stop = () => {
    session?.stop();
    session = null;
    current = null;
    ev.onPlaying(null);
  };

  /** Starts the sample at `url` for `id`, or stops it when it is the one playing. */
  const toggle = (id: string, url: string) => {
    if (current === id) return stop();
    stop();
    // The first status updates are the load; only a stop after playing began is an outside pause.
    let started = false;
    try {
      const s = audio.open([url], {
        title: "Voice sample",
        onState: (st) => {
          if (session !== s) return;
          if (st.failed) {
            stop();
            return ev.onError("That sample could not be played.");
          }
          if (st.ended) return stop();
          if (st.playing) started = true;
          else if (started) stop();
        },
      });
      session = s;
      current = id;
      ev.onPlaying(id);
      s.play();
    } catch {
      stop();
      ev.onError("That sample could not be played.");
    }
  };

  return { toggle, stop };
}
