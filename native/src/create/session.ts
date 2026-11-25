// The Create flow's state, shared by its three screens: the wish being typed, the
// free-creation count, and the script and recording once made. Rules are in lib/create.ts.
import { useSyncExternalStore } from "react";
import { FREE_STORAGE_KEY, type Made, freeLeft, makeManifestation, nextVariant, parseCount } from "@/lib/create";
import { DRAFT_STORAGE_KEY, parseDraft } from "@/lib/draftStore";
import { resolveVoice } from "@/lib/voices";
import { api } from "../api";
import { kv } from "../seams/kv";
import { settings } from "../seams/settings";

export type CreateState = {
  want: string;
  name: string;
  /** Free creations used on this device. */
  used: number;
  variant: number;
  /** The free creations are used up and one more was asked for. */
  gate: boolean;
  making: boolean;
  /** The voice chosen in Settings: the one the next recording uses. */
  voiceName: string;
  made: Made | null;
};

let state: CreateState = { want: "", name: "", used: 0, variant: 0, gate: false, making: false, voiceName: resolveVoice(null).name, made: null };
const subs = new Set<() => void>();
const set = (p: Partial<CreateState>) => {
  state = { ...state, ...p };
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));
const snapshot = () => state;
export const useCreate = (): CreateState => useSyncExternalStore(subscribe, snapshot, snapshot);

// Storage can refuse (private mode, full disk). The form still works; it just is not kept.
const read = (key: string) => kv.get(key).catch(() => null);
const write = (key: string, value: string | null) => void (value === null ? kv.remove(key) : kv.set(key, value)).catch(() => undefined);

/** Whether this device can read a script aloud itself. Browsers can; the phone build cannot yet. */
export const canSpeak = (): boolean => typeof (globalThis as { speechSynthesis?: unknown }).speechSynthesis !== "undefined";

let typed = false;
/** Reads what the device keeps: the draft, the count and the chosen voice. Run when the wish step shows. */
export async function load(): Promise<void> {
  const [draft, used, chosen] = await Promise.all([read(DRAFT_STORAGE_KEY), read(FREE_STORAGE_KEY), settings.read()]);
  // Typing that began before storage answered wins over the stored draft.
  set({ ...(typed ? {} : parseDraft(draft)), used: parseCount(used), voiceName: resolveVoice(chosen.voiceId).name });
}

/** Typing saves the draft, so a trip to Settings or a restart keeps it (#100). */
export function edit(p: { want?: string; name?: string }): void {
  typed = true;
  set(p);
  write(DRAFT_STORAGE_KEY, state.want || state.name ? JSON.stringify({ want: state.want, name: state.name }) : null);
}

let run = 0;
async function generate(variant: number): Promise<void> {
  const mine = ++run;
  set({ making: true, made: null, variant });
  const chosen = await settings.read();
  set({ voiceName: resolveVoice(chosen.voiceId).name });
  const made = await makeManifestation(api, { want: state.want, name: state.name, variant, ...chosen }, canSpeak());
  // A newer request, or leaving the flow, replaces this one.
  if (run === mine) set({ making: false, made });
}

/** Counts one free creation. False, with the gate shown, when none are left. */
function spend(): boolean {
  if (freeLeft(state.used) === 0) {
    set({ gate: true });
    return false;
  }
  set({ gate: false, used: state.used + 1 });
  write(FREE_STORAGE_KEY, String(state.used));
  return true;
}

/** Starts a recording for the typed wish. False when there is no wish or no free creation left. */
export function create(): boolean {
  if (!state.want.trim() || !spend()) return false;
  void generate(0);
  return true;
}
export function newVariation(): boolean {
  if (!spend()) return false;
  void generate(nextVariant(state.variant));
  return true;
}
/** Back to the wish step. A request still running is dropped. */
export function leave(): void {
  run++;
  set({ making: false, made: null });
}
/** "Reset demo": the free creations start again. */
export function reset(): void {
  leave();
  set({ used: 0, gate: false });
  write(FREE_STORAGE_KEY, "0");
}
