// "Play all on loop" on the Library screen (#157). One session for the whole Library: every recording in
// the Library's order, a pause after each, the audio engine's loop returning to the first after the last,
// so it continues with the screen locked. Framework-free; the screen reads `state` and calls start and stop.
import { gapClip, roundAt } from "@/lib/playerQueue";
import type { AudioSeam, PlaySession } from "../seams/types";
import { LOOP_GAP_MS, type LoopItem, loopQueue } from "./loop";

export type PlaylistState = {
  status: "idle" | "preparing" | "playing" | "paused";
  /** The recording now playing (the one a pause follows). */
  title: string;
  /** Its place in the list, from 1. */
  position: number;
  total: number;
  /** Why the last start did not play, or "". */
  error: string;
};
const IDLE: PlaylistState = { status: "idle", title: "", position: 0, total: 0, error: "" };

export function makePlaylistLoop(d: { audio: Pick<AudioSeam, "configure" | "save" | "open">; load(): Promise<LoopItem<string>[]> }) {
  let state = IDLE;
  const subs = new Set<() => void>();
  let session: PlaySession | null = null;
  // Counts starts and stops, so a start that was stopped meanwhile can tell.
  let run = 0;
  let ready: Promise<{ items: LoopItem<string>[]; gap: string } | null> | null = null;
  const set = (p: Partial<PlaylistState>) => {
    state = { ...state, ...p };
    subs.forEach((f) => f());
  };
  // The recordings and the gap clip, made ahead so Play does not wait (a browser needs Play inside the tap).
  const build = async () => {
    const items = await d.load();
    if (!items.length) return null;
    return { items, gap: await d.audio.save("player-gap-loop-bell.wav", gapClip(true, LOOP_GAP_MS), "audio/wav") };
  };
  const prepare = () => (ready ??= build().catch(() => (ready = null)));
  const stop = () => {
    run++;
    session?.stop();
    session = null;
    set(IDLE);
  };
  const fail = (error: string) => {
    stop();
    set({ error });
  };
  return {
    state: () => state,
    subscribe(fn: () => void): () => void {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    prepare,
    /** The Library changed: copy again at the next start. */
    reset() {
      ready = null;
    },
    async start() {
      if (state.status !== "idle") return;
      const mine = ++run;
      set({ ...IDLE, status: "preparing" });
      try {
        await d.audio.configure().catch(() => {});
        const r = await prepare();
        if (mine !== run) return;
        if (!r) return set({ ...IDLE, error: "Nothing to play yet. Save a recording first." });
        const q = loopQueue("all", r.items, r.items[0].id, r.gap);
        const at = (i: number) => Math.min(q.items.length, roundAt(i).round);
        const s = d.audio.open(q.clips, {
          title: "Neville",
          loop: true,
          onState: (st) => {
            if (mine !== run) return;
            if (st.failed) return fail("A recording could not be played.");
            set({ status: st.playing ? "playing" : "paused", title: q.items[at(st.index) - 1].title, position: at(st.index) });
          },
        });
        session = s;
        set({ status: "playing", title: q.items[0].title, position: 1, total: q.items.length });
        s.play();
      } catch {
        if (mine === run) fail("Could not start playing.");
      }
    },
    stop,
  };
}
