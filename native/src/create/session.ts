// The Create flow's state, shared by its three screens: the wish being typed, the
// free-creation count, and the script and recording once made. Rules are in lib/create.ts.
import { useSyncExternalStore } from "react";
import { FREE_STORAGE_KEY, type Made, makeManifestation, nextVariant, parseCount, pickOnCreate, seeSettingsVoice, toManifestation } from "@/lib/create";
import { DRAFT_STORAGE_KEY, parseDraft } from "@/lib/draftStore";
import { canCreate, isSignedIn } from "@/lib/createGate";
import { newId } from "@/lib/library/model";
import { resolveVoice } from "@/lib/voices";
import { currentAccount } from "../accountStore";
import { api } from "../api";
import { kv } from "../seams/kv";
import { library } from "../seams/library";
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
  /** A voice picked on the Create page; null means the Settings choice. Cleared when the Settings voice changes. */
  picked: string | null;
  /** The voice the next recording uses: the pick, else the Settings choice. */
  voiceId: string;
  voiceName: string;
  made: Made | null;
  /** The Library id of `made` once saved; empty until then. */
  savedId: string;
};

let state: CreateState = { want: "", name: "", used: 0, variant: 0, gate: false, making: false, picked: null, voiceId: resolveVoice(null).id, voiceName: resolveVoice(null).name, made: null, savedId: "" };
const subs = new Set<() => void>();
const set = <P extends Partial<CreateState>>(p: P): P => {
  state = { ...state, ...p };
  subs.forEach((f) => f());
  return p;
};
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));
const snapshot = () => state;
export const useCreate = (): CreateState => useSyncExternalStore(subscribe, snapshot, snapshot);

// Storage can refuse (private mode, full disk). The form still works; it just is not kept.
const read = (key: string) => kv.get(key).catch(() => null);
const write = (key: string, value: string | null) => void (value === null ? kv.remove(key) : kv.set(key, value)).catch(() => undefined);

/** Whether this device can read a script aloud itself. Browsers can; the phone build cannot yet. */
export const canSpeak = (): boolean => typeof (globalThis as { speechSynthesis?: unknown }).speechSynthesis !== "undefined";

/** The state for a voice id: its id and the name to show. */
const voice = (id: string) => ({ voiceId: id, voiceName: resolveVoice(id).name });

// The Settings voice last seen; the rules are in lib/create.ts.
let settingsVoice: string | null = null;
function voiceNow(settingsVoiceId: string) {
  const next = seeSettingsVoice({ picked: state.picked, settingsVoice }, settingsVoiceId);
  settingsVoice = next.settingsVoice;
  return { picked: next.picked, ...voice(next.voiceId) };
}

let typed = false;
/** Reads what the device keeps: the draft, the count and the chosen voice. Run when the wish step shows. */
export async function load(): Promise<void> {
  const [draft, used, chosen] = await Promise.all([read(DRAFT_STORAGE_KEY), read(FREE_STORAGE_KEY), settings.read()]);
  // Typing that began before storage answered wins over the stored draft.
  set({ ...(typed ? {} : parseDraft(draft)), used: parseCount(used), ...voiceNow(chosen.voiceId) });
}

/** Typing saves the draft, so a trip to Settings or a restart keeps it (#100). */
export function edit(p: { want?: string; name?: string }): void {
  typed = true;
  set(p);
  write(DRAFT_STORAGE_KEY, state.want || state.name ? JSON.stringify({ want: state.want, name: state.name }) : null);
}

/** Picks the voice for the next recording here on Create. `asDefault` also makes it the Settings choice. */
export async function pickVoice(id: string, asDefault = false): Promise<boolean> {
  const next = pickOnCreate({ picked: state.picked, settingsVoice }, id, state.voiceId, asDefault);
  settingsVoice = next.settingsVoice;
  set({ picked: next.picked, ...voice(next.voiceId) });
  return asDefault ? settings.write({ voiceId: next.voiceId }) : true;
}

let run = 0;
/** The wish the current `made` was asked for. The form can change afterwards. */
let asked = { want: "", name: "" };
async function generate(variant: number): Promise<void> {
  const mine = ++run;
  set({ making: true, made: null, savedId: "", variant });
  const wish = { want: state.want, name: state.name };
  const chosen = await settings.read();
  const { voiceId } = set(voiceNow(chosen.voiceId));
  const made = await makeManifestation(api, { ...wish, variant, ...chosen, voiceId }, canSpeak());
  // A newer request, or leaving the flow, replaces this one.
  if (run !== mine) return;
  asked = wish;
  set({ making: false, made });
}

/** Counts one free creation. False, with the gate shown, when a signed-out user has none left. A signed-in user is not held to the count (#164). */
function spend(): boolean {
  const signedIn = isSignedIn(currentAccount());
  if (!canCreate(signedIn, state.used)) {
    set({ gate: true });
    return false;
  }
  set({ gate: false });
  if (!signedIn) {
    set({ used: state.used + 1 });
    write(FREE_STORAGE_KEY, String(state.used));
  }
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
  set({ making: false, made: null, savedId: "" });
}
/** "Reset demo": the free creations start again. */
export function reset(): void {
  leave();
  set({ used: 0, gate: false });
  write(FREE_STORAGE_KEY, "0");
}

/** Keeps the result in the Library on this device and gives its id. Rejects with a message to show. */
export async function save(): Promise<string> {
  const made = state.made;
  if (!made) throw new Error("Nothing to save.");
  if (state.savedId) return state.savedId;
  const id = newId();
  const audio = made.recording ? { bytes: new Uint8Array(made.recording.audio), mime: made.recording.mime } : null;
  await library.save(toManifestation(made, asked, id), audio);
  // A new variation made while saving is not this saved one.
  if (state.made === made) set({ savedId: id });
  return id;
}
