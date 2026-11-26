// Copies of recordings for the Player and the Library loop (#157): the library may free its addresses at
// any time, so a session plays its own copy. Made one at a time, so a late copy never replaces a newer one.
import { newestFirst } from "@/lib/library/model";
import { audio } from "../seams/audio";
import { library } from "../seams/library";
import type { LoopItem } from "./loop";

let copying: Promise<unknown> = Promise.resolve();

/** Runs `fn` after the copies already queued. */
export const inOrder = <T,>(fn: () => Promise<T>): Promise<T> => {
  const next = copying.then(fn);
  return (copying = next.catch(() => {})), next;
};

/** Every saved recording in the Library's order (newest first), each copied once. `me` is already copied. */
export async function libraryRecordings(gone: () => boolean, me?: LoopItem<string>): Promise<LoopItem<string>[]> {
  const out: LoopItem<string>[] = [];
  for (const m of newestFirst((await library.load()).manifestations)) {
    if (!m.hasAudio || gone()) continue;
    const src =
      me && m.id === me.id
        ? me.src
        : await library.audioUri(m.id).then((u) => (u ? inOrder(() => (gone() ? Promise.resolve(null) : audio.keep(`player-loop-${out.length}`, u))) : null)).catch(() => null);
    if (src) out.push({ id: m.id, src, title: m.title || "Untitled" });
  }
  return out;
}
