// "Play all on loop" on the Library screen (#157): one looping session for the whole Library, so it
// continues with the screen locked. Framework-free; the screen reads `state` and calls start and stop.
import { gapClip, roundAt } from "@/lib/playerQueue";
import type { AudioSeam, PlaySession } from "../seams/types";
import { LOOP_GAP_MS, type LoopItem, PLAYLIST_GAP_NAME, loopQueue } from "./loop";

export type PlaylistState = {
  status: "idle" | "preparing" | "playing" | "paused";
  title: string;
  position: number;
  total: number;
  error: string;
};
const IDLE: PlaylistState = { status: "idle", title: "", position: 0, total: 0, error: "" };

export function makePlaylistLoop(d: {
  audio: Pick<AudioSeam, "configure" | "save" | "open" | "onOpen">;
  load(): Promise<LoopItem<string>[]>;
  /** Calls `fn` after any change to the saved Library. */
  onLibraryChange(fn: () => void): () => void;
}) {
  let state = IDLE;
  const subs = new Set<() => void>();
  let session: PlaySession | null = null;
  // Counts starts and stops, so a start that was stopped meanwhile can tell.
  let run = 0;
  let ready: Promise<{ items: LoopItem<string>[]; gap: string } | null> | null = null;
  const set = (p: Partial<PlaylistState>) => ((state = { ...state, ...p }), subs.forEach((f) => f()));
  // The recordings and the gap clip, made ahead so Play does not wait (a browser needs Play inside the tap).
  const build = async () => {
    const items = await d.load();
    if (!items.length) return null;
    return { items, gap: await d.audio.save(PLAYLIST_GAP_NAME, gapClip(true, LOOP_GAP_MS), "audio/wav") };
  };
  // A failed build is forgotten, so the next start tries again; it stays a failure, not an empty Library.
  const prepare = () => {
    const p = (ready ??= build());
    p.catch(() => void (ready === p && (ready = null)));
    return p;
  };
  const stop = () => {
    run++;
    session?.stop();
    session = null;
    set(IDLE);
  };
  const fail = (error: string) => (stop(), set({ error }));
  // Another session in the app (a Create preview, the Player) takes over, so two never play at once.
  let opening = false;
  d.audio.onOpen(() => !opening && session && stop());
  // A recording may be deleted or replaced: end the loop, and copy again at the next start.
  d.onLibraryChange(() => {
    ready = null;
    if (state.status !== "idle") stop();
  });
  return {
    state: () => state,
    subscribe: (fn: () => void) => (subs.add(fn), () => void subs.delete(fn)),
    prepare,
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
        opening = true;
        let s: PlaySession;
        try {
          s = d.audio.open(q.clips, {
            title: "Neville",
            loop: true,
            onState: (st) => {
              if (mine !== run) return;
              if (st.failed) return fail("A recording could not be played.");
              set({ status: st.playing ? "playing" : "paused", title: q.items[at(st.index) - 1].title, position: at(st.index) });
            },
          });
        } finally {
          opening = false;
        }
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
