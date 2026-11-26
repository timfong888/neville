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

/** The Player's gap clip names. The Library loop has its own, so neither frees the other's clip on the web. */
export const playerGapName = (looping: boolean, bell: boolean) => `player-gap${looping ? "-loop" : ""}${bell ? "-bell" : ""}.wav`;
export const PLAYLIST_GAP_NAME = "playlist-gap.wav";
/** The Library loop's and the Create recording loop's gap clips: one name per bell choice, so neither clip replaces the other. */
export const playlistGapName = (bell: boolean) => (bell ? "playlist-gap-bell.wav" : PLAYLIST_GAP_NAME);
export const createGapName = (bell: boolean) => `create-gap${bell ? "-bell" : ""}.wav`;

/** A soft bell in the gap between recordings (#177). One choice for the Library loop and the Create recording loop. */
export const BELL_KEY = "nvn_loop_bell";
export const DEFAULT_BELL = true;
export const parseBell = (v: string | null | undefined): boolean => (v === "off" ? false : v === "on" ? true : DEFAULT_BELL);

/** The Player has Off and One. "All" starts from the Library, so a stored All (PR 158) reads as Off. */
export const playerLoop = (v: string | null | undefined): LoopMode => (parseLoop(v) === "one" ? "one" : "off");

export function makeLoopStore(kv: KV) {
  return {
    async read(): Promise<LoopMode> {
      return parseLoop(await kv.get(LOOP_KEY));
    },
    /** False when the device refused the write. */
    write: (mode: LoopMode): Promise<boolean> => kv.set(LOOP_KEY, mode),
  };
}

export function makeBellStore(kv: KV) {
  return {
    async read(): Promise<boolean> {
      return parseBell(await kv.get(BELL_KEY));
    },
    /** False when the device refused the write. */
    write: (on: boolean): Promise<boolean> => kv.set(BELL_KEY, on ? "on" : "off"),
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
