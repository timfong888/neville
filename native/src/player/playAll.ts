// "Play all on loop" (#157) as a job for the app-level controller: every recording in the Library's order,
// a pause after each, the engine's loop returning to the first after the last.
import { gapClip, roundAt } from "@/lib/playerQueue";
import type { AudioSeam } from "../seams/types";
import { LOOP_GAP_MS, type LoopItem, PLAYLIST_GAP_NAME, loopQueue } from "./loop";
import type { PlayJob, Prepared } from "./nowPlaying";

export function makePlayAll(d: { save: AudioSeam["save"]; load(): Promise<LoopItem<string>[]> }) {
  let ready: Promise<Prepared | null> | null = null;
  const build = async (): Promise<Prepared | null> => {
    const items = await d.load();
    if (!items.length) return null;
    const q = loopQueue("all", items, items[0].id, await d.save(PLAYLIST_GAP_NAME, gapClip(true, LOOP_GAP_MS), "audio/wav"));
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
  const job: PlayJob = { id: "all", title: "Neville", route: "/library", empty: "Nothing to play yet. Save a recording first.", prepare };
  return { job, prepare, /** The Library changed: copy again at the next start. */ reset: () => void (ready = null) };
}
