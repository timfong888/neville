// The Player's loop control (#157). Framework-free, so the repo's unit tests can run it.
//   off: the item plays, repeats for the chosen minutes, then stops (as before).
//   one: the open item repeats until stopped.
//   all: the Library's recordings play in the order it shows them, from the open item, and the
//        first starts again after the last. The audio engine does the wrap (loop "all"), so it
//        carries on with the screen locked.
import type { KV } from "../seams/kv.types";

export type LoopMode = "off" | "one" | "all";
export const LOOP_MODES: readonly LoopMode[] = ["off", "one", "all"];
export const DEFAULT_LOOP: LoopMode = "off";
/** Not one of the website's `nv_` keys: the website has its own Repeat setting. */
export const LOOP_KEY = "nvn_loop";
/** Silence between manifestations, the last and the first included. The bell (1.8 s) fits inside it. */
export const LOOP_GAP_MS = 1800;

export const parseLoop = (v: string | null | undefined): LoopMode => LOOP_MODES.find((m) => m === v) ?? DEFAULT_LOOP;

export function makeLoopStore(kv: KV) {
  return {
    async read(): Promise<LoopMode> {
      return parseLoop(await kv.get(LOOP_KEY));
    },
    /** False when the device refused the write. */
    write: (mode: LoopMode): Promise<boolean> => kv.set(LOOP_KEY, mode),
  };
}

export type LoopItem<T> = { id: string; src: T; title: string };

/**
 * The clips for "one" and "all", in play order, each followed by `gap`, and the items in that order.
 * `items` is the Library's recordings in shown order. `opened` stands in when it is not among them.
 */
export function loopQueue<T>(mode: "one" | "all", items: LoopItem<T>[], openedId: string, gap: T, opened?: LoopItem<T>): { clips: T[]; items: LoopItem<T>[] } {
  const at = items.findIndex((i) => i.id === openedId);
  const first = at >= 0 ? items[at] : opened;
  const order = mode === "one" || !first ? (first ? [first] : []) : at >= 0 ? [...items.slice(at), ...items.slice(0, at)] : [first];
  return { clips: order.flatMap((i) => [i.src, gap]), items: order };
}
