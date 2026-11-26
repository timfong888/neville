// The app-level audio controller (#161): one session, owned here and not by a screen, so playback keeps
// going while the listener moves between screens. A screen starts a job and reads the state; leaving the
// screen changes nothing. Framework-free; the audio seam is passed in.
import type { AudioSeam, PlaySession } from "../seams/types";

export type NowPlayingState = {
  status: "idle" | "preparing" | "playing" | "paused";
  /** Which job: a manifestation's id, or "all" for the Library loop. "" when nothing is. */
  id: string;
  title: string;
  /** Where the now-playing bar goes when tapped. */
  route: string;
  index: number;
  /** Place in the job (a play of the recording, or a recording in the Library). */
  position: number;
  total: number;
  loop: boolean;
  /** Why it ended or did not start, or "". */
  note: string;
  /** How far through the current clip, 0–1. Retained while paused; 0 when idle. */
  progress: number;
};
const IDLE: NowPlayingState = { status: "idle", id: "", title: "", route: "", index: 0, position: 0, total: 0, loop: false, note: "", progress: 0 };

export type Prepared = { clips: string[]; loop: boolean; /** Put the music player under this session. */ music?: boolean; at(index: number): { title: string; position: number; total: number } };
/** What to play. `title` is the lock screen's; `at` gives the title and place shown for a position. */
export type PlayJob = { id: string; title: string; route: string; empty: string; prepare(): Promise<Prepared | null> };

/** The now-playing bar shows while a session plays or is paused. */
export const showsBar = (s: NowPlayingState) => s.status === "playing" || s.status === "paused";

export function makeNowPlaying(audio: Pick<AudioSeam, "configure" | "open" | "opened">) {
  let state = IDLE;
  const subs = new Set<() => void>();
  let session: PlaySession | null = null;
  // Counts starts and stops, so a report from a session that was replaced or stopped is ignored.
  let run = 0;
  const set = (p: Partial<NowPlayingState>) => ((state = { ...state, ...p }), subs.forEach((f) => f()));
  const end = (patch: Partial<NowPlayingState> = {}) => {
    run++;
    session?.stop();
    session = null;
    state = IDLE;
    set(patch);
  };
  return {
    state: () => state,
    subscribe: (fn: () => void) => (subs.add(fn), () => void subs.delete(fn)),
    /** Replaces whatever is playing with this job. */
    async play(job: PlayJob) {
      end();
      const mine = run;
      const seen = audio.opened();
      set({ id: job.id, title: job.title, route: job.route, status: "preparing" });
      try {
        await audio.configure().catch(() => {});
        const p = await job.prepare();
        if (mine !== run) return;
        // Another session opened while this one was preparing: the later request wins.
        if (audio.opened() !== seen) return end();
        if (!p) return end({ id: job.id, note: job.empty });
        const s = audio.open(p.clips, {
          title: job.title,
          loop: p.loop,
          music: p.music,
          onState: (st) => {
            if (mine !== run) return;
            if (st.failed) return end({ id: job.id, note: "This recording could not be played." });
            if (st.ended) return end(st.replaced ? {} : { id: job.id, note: "Finished." });
            set({ status: st.playing ? "playing" : "paused", index: st.index, progress: st.progress ?? state.progress, ...p.at(st.index) });
          },
        });
        session = s;
        set({ status: "playing", index: 0, loop: p.loop, ...p.at(0) });
        s.play();
      } catch {
        if (mine === run) end({ id: job.id, note: "Could not start playing." });
      }
    },
    /** Pause, or resume. */
    toggle: () => (state.status === "playing" ? session?.pause() : state.status === "paused" ? session?.play() : undefined),
    /** Stops it, or only the job with this id. */
    stop: (onlyId?: string) => void ((!onlyId || state.id === onlyId) && end()),
  };
}
