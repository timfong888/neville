// Decides when the Create step should say that playback was paused while the app was away (#153).
// The pause and the return to the foreground can arrive in either order, so the note waits briefly.
const GRACE_MS = 2000;

export function pauseWatch(explain: () => void) {
  let left = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    left = false;
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return {
    /** The app state changed. `playing`: a clip is active and not paused. */
    appState(st: string, playing: boolean, paused: boolean) {
      if (st === "background" && playing) left = true;
      if (st === "active" && left) {
        if (paused) return clear(), explain();
        timer = setTimeout(clear, GRACE_MS);
      }
    },
    /** The player reported playing or paused. */
    playing(p: boolean) {
      if (!p && left) clear(), explain();
    },
    reset: clear,
  };
}
