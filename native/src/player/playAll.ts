// "Play all on loop" (#157) as a job for the app-level controller: every recording in the Library's order,
// a pause after each (with a soft bell when on), the engine's loop returning to the first after the last.
import { gapClip, roundAt } from "@/lib/playerQueue";
import type { AudioSeam } from "../seams/types";
import { LOOP_GAP_MS, type LoopItem, loopQueue, playlistGapName } from "./loop";
import type { PlayJob, Prepared } from "./nowPlaying";

export function makePlayAll(d: { save: AudioSeam["save"]; load(gone: () => boolean): Promise<LoopItem<string>[]>; /** Whether the gap carries the bell. Read at each build. */ bell(): Promise<boolean>; /** Measure the duration of a clip in seconds. When provided, the prepared result includes `durationSec`. */ duration?: (src: string) => Promise<number> }) {
  let ready: Promise<Prepared | null> | null = null;
  // Bumped by `reset`, so a build the Library has outdated stops copying and cannot replace the new build's names.
  let gen = 0;
  // The clip-ordered items from the last completed build, so a library change can find the playing item's id.
  let lastQueueItems: LoopItem<string>[] = [];
  const listeners = new Set<() => void>();
  // `startId`: the item whose successor begins the new queue (null = start from items[0]).
  //   - null → standard build from the first item.
  //   - non-null and found → start from the item after startId (wrapping).
  //   - non-null but deleted → start from items[0].
  const buildFrom = async (startId: string | null): Promise<Prepared | null> => {
    const mine = gen;
    const items = await d.load(() => mine !== gen);
    if (!items.length) return null;
    const bell = await d.bell();
    const gapFile = await d.save(playlistGapName(bell), gapClip(bell, LOOP_GAP_MS), "audio/wav");
    const prevIdx = startId ? items.findIndex((i) => i.id === startId) : -1;
    const effectiveStart = prevIdx >= 0 ? items[(prevIdx + 1) % items.length].id : items[0].id;
    const q = loopQueue("all", items, effectiveStart, gapFile);
    if (mine === gen) lastQueueItems = q.items;
    const at = (i: number) => {
      const n = Math.min(q.items.length, roundAt(i).round);
      return { title: q.items[n - 1].title, position: n, total: q.items.length };
    };
    let durationSec: number | undefined;
    if (d.duration && items.length > 0) {
      const durs = await Promise.all(items.map((it) => d.duration!(it.src).catch(() => 0)));
      const gapSec = LOOP_GAP_MS / 1000;
      // Each item is followed by a gap (including the last, before looping back).
      durationSec = durs.reduce((s, v) => s + v, 0) + items.length * gapSec;
    }
    return { clips: q.clips, loop: true, at, durationSec };
  };
  // Made ahead, so Play does not wait (a browser needs Play inside the tap). A failed build is forgotten.
  const prepare = () => {
    const p = (ready ??= buildFrom(null));
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
    /** The item id at clip index `i` in the last completed build's queue order, for finding the playing item. */
    idAtClipIndex(clipIndex: number): string | undefined {
      return lastQueueItems[Math.floor(Math.max(0, clipIndex) / 2)]?.id;
    },
    /** A one-shot job that starts from the item after `prevPlayingId` in the new library.
     *  If `prevPlayingId` was deleted, starts from the first item. Shows the library-change
     *  note when nothing remains. */
    jobFrom(prevPlayingId: string | null): PlayJob {
      return { ...job, empty: "Playback stopped because your library changed.", prepare: () => buildFrom(prevPlayingId) };
    },
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
