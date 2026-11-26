// The stored bell choice for looping several recordings (#177), shared by the Library and the Create recording page.
import { useEffect, useState } from "react";
import { kv } from "../seams/kv";
import { DEFAULT_BELL, makeBellStore } from "./loop";

const store = makeBellStore(kv);
const listeners = new Set<() => void>();
// Kept in memory too, so a device that refuses the write still honours the choice until the app closes.
let current: boolean | null = null;

/** The choice now: this session's, else the stored one, else On. */
export async function bellNow(): Promise<boolean> {
  return current ?? (current = await store.read().catch(() => DEFAULT_BELL));
}
/** False when the device refused to keep it; the choice still applies until the app closes. */
export async function setBell(on: boolean): Promise<boolean> {
  current = on;
  const ok = await store.write(on).catch(() => false);
  listeners.forEach((fn) => fn());
  return ok;
}
export const onBellChange = (fn: () => void): (() => void) => (listeners.add(fn), () => void listeners.delete(fn));

export function useBell(): boolean {
  const [on, setOn] = useState(current ?? DEFAULT_BELL);
  useEffect(() => {
    let live = true;
    const load = () => void bellNow().then((v) => live && setOn(v));
    load();
    const off = onBellChange(load);
    return () => {
      live = false;
      off();
    };
  }, []);
  return on;
}
