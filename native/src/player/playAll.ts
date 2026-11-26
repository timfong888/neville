// "Play all on loop" (#157) as a job for the app-level controller: every recording in the Library's order,
// a pause after each (with a soft bell when on), the engine's loop returning to the first after the last.
import { gapClip, roundAt } from "@/lib/playerQueue";
import type { AudioSeam } from "../seams/types";
import { LOOP_GAP_MS, type LoopItem, loopQueue, playlistGapName } from "./loop";
import type { PlayJob, Prepared } from "./nowPlaying";

export function makePlayAll(d: { save: AudioSeam["save"]; load(gone: () => boolean): Promise<LoopItem<string>[]>; /** Whether the gap carries the bell. Read at each build. */ bell(): Promise<boolean> }) {
  let ready: Promise<Prepared | null> | null = null;
  // Bumped by `reset`, so a build the Library has outdated stops copying and cannot replace the new build's names.
  let gen = 0;
  const listeners = new Set<() => void>();
  const build = async (): Promise<Prepared | null> => {
    const mine = gen;
    const items = await d.load(() => mine !== gen);
    if (!items.length) return null;
    const bell = await d.bell();
    const q = loopQueue("all", items, items[0].id, await d.save(playlistGapName(bell), gapClip(bell, LOOP_GAP_MS), "audio/wav"));
    const at = (i: number) => {
      const n = Math.min(q.items.length, roundAt(i).round);
      return { title: q.items[n - 1].title, position: n, total: q.items.length };
    };
    return { clips: q.clips, loop: true, at };
  };
  // Made ahead, so Play does not wait (a browser needs Play inside the tap). A failed build is forgotten.
  const prepare = () => {
    const p = (ready ??= build());
    p.catch(() => void (ready === p && (ready = null)));
    return p;
  };
  // What a start waits for is never an outdated build.
  const current = async (): Promise<Prepared | null> => {
    for (;;) {
      const mine = gen;
      const p = await prepare();
      if (mine === gen) return p;
    }
  };
  const job: PlayJob = { id: "all", title: "Neville", route: "/library", empty: "Nothing to play yet. Save a recording first.", prepare: current };
  return {
    job,
    prepare: current,
    /** The Library changed: copy again at the next start, and tell whoever made the copies ahead. */
    reset() {
      gen++;
      ready = null;
      listeners.forEach((fn) => fn());
    },
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}
