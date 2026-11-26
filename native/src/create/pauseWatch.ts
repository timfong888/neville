// Decides when the Create step should say that playback was paused while the app was away (#153).
// The pause and the return to the foreground can arrive in either order, so the note waits briefly.
// The wait is short because a pause made in the foreground in that window cannot be told apart.
const GRACE_MS = 500;

export function pauseWatch(explain: () => void) {
  let left = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stopTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const clear = () => {
    left = false;
    stopTimer();
  };
  return {
    /** The app state changed. `playing`: a clip is active and not paused. */
    appState(st: string, playing: boolean, paused: boolean) {
      // Leaving again cancels the grace timer of the earlier return.
      if (st === "background" && playing) (stopTimer(), (left = true));
      if (st === "active" && left) {
        if (paused) return clear(), explain();
        stopTimer();
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
