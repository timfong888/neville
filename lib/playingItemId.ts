// Pure helper (#204): which Library item is currently audible, or null.
import type { Manifestation } from "@/lib/library/model";

/** The subset of NowPlayingState this function needs. */
export type PlayingState = {
  status: "idle" | "preparing" | "playing";
  id: string;
  index: number;
};

/**
 * Returns the id of the Library item that is playing or paused, or null when
 * nothing is audible.  For Play all (state.id === "all") the queue alternates
 * recording clip and gap clip, so floor(state.index / 2) selects the recording.
 * `items` should be the Library's full manifestation list in shown order;
 * only the hasAudio ones are considered, in that same order.
 */
export function playingItemId(state: PlayingState, items: Manifestation[]): string | null {
  if (state.status === "idle") return null;
  if (state.id === "all") {
    const recordings = items.filter((m) => m.hasAudio);
    const pos = Math.floor(state.index / 2);
    return recordings[pos]?.id ?? null;
  }
  return state.id || null;
}
