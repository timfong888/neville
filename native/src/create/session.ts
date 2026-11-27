// The Create flow's state, shared by its three screens: the wish being typed, the
// free-creation count, and the script and recording once made. Rules are in lib/create.ts.
import { useSyncExternalStore } from "react";
import { FALLBACK_TITLE, FREE_STORAGE_KEY, type Made, type ScriptMode, SCRIPT_MODE_KEY, makeManifestation, nextVariant, noteForReason, parseCount, pickOnCreate, seeSettingsVoice, toManifestation, wishRequest } from "@/lib/create";
import { DRAFT_STORAGE_KEY, parseDraft } from "@/lib/draftStore";
import { createAccess, isSignedIn } from "@/lib/createGate";
import { newId } from "@/lib/library/model";
import { lineStarts } from "@/lib/audio";
import { displayTitle, neutralScript, scriptLines, toYouStatement } from "@/lib/script";
import { detectPaywallError, type PaywallError } from "@/lib/paywall";
import { ApiError } from "@/lib/api/client";
import { resolveVoice } from "@/lib/voices";
import { currentView } from "../accountStore";
import { api } from "../api";
import { PAYWALL_ENABLED } from "../config";
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
  /** Set when a paywall signal is received (402, 401, or 504 with paywall on). */
  paywallError: PaywallError | null;
  /** Whether to use the person's exact words or enhance with AI. */
  scriptMode: ScriptMode;
};

let state: CreateState = { want: "", name: "", used: 0, variant: 0, gate: false, making: false, picked: null, voiceId: resolveVoice(null).id, voiceName: resolveVoice(null).name, made: null, savedId: "", paywallError: null, scriptMode: "enhance" };
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
/** Reads what the device keeps: the draft, the count, the chosen voice, and the script mode. Run when the wish step shows. */
export async function load(): Promise<void> {
  const [draft, used, chosen, modeRaw] = await Promise.all([read(DRAFT_STORAGE_KEY), read(FREE_STORAGE_KEY), settings.read(), read(SCRIPT_MODE_KEY)]);
  const scriptMode: ScriptMode = modeRaw === "exact" ? "exact" : "enhance";
  // Typing that began before storage answered wins over the stored draft.
  set({ ...(typed ? {} : parseDraft(draft)), used: parseCount(used), ...voiceNow(chosen.voiceId), scriptMode });
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

/** Clears the paywall error state (e.g. when the user dismisses the sheet). */
export function clearPaywallError(): void {
  set({ paywallError: null });
}

/** Switches between exact and enhance writing modes and persists the choice. */
export function setScriptMode(mode: ScriptMode): void {
  set({ scriptMode: mode });
  write(SCRIPT_MODE_KEY, mode);
}

let run = 0;
/** The wish the current `made` was asked for. The form can change afterwards. */
let asked = { want: "", name: "" };
async function generate(variant: number): Promise<void> {
  const mine = ++run;
  set({ making: true, made: null, savedId: "", variant, paywallError: null });
  const wish = { want: state.want, name: state.name };
  const chosen = await settings.read();
  const { voiceId } = set(voiceNow(chosen.voiceId));
  const scriptMode = state.scriptMode;

  if (PAYWALL_ENABLED) {
    // Paywall path: call api.manifest directly so we can intercept 401/402/504.
    try {
      const r = await api.manifest(wishRequest({ ...wish, variant, ...chosen, voiceId, scriptMode }));
      if (run !== mine) return;
      asked = wish;
      const voice = resolveVoice(r.voiceId);
      const made: Made = {
        title: r.source === "template" ? FALLBACK_TITLE : (r.title ?? displayTitle(toYouStatement(wish.want))),
        lines: r.lines,
        note: r.source === "template" ? noteForReason(r.reason, r.term) : r.scriptMode === "exact" ? "Your exact words." : "",
        recording: { audio: r.audio, mime: r.mime, voiceId: voice.id, voiceName: voice.name, starts: r.starts ?? lineStarts(r.lines) },
        ...(r.scriptMode === "exact" ? { scriptMode: "exact" as const } : {}),
      };
      set({ making: false, made });
    } catch (e) {
      if (run !== mine) return;
      const pe = detectPaywallError(e, true);
      if (pe) {
        set({ making: false, paywallError: pe });
        return;
      }
      // Non-paywall error: build a "failed" Made.
      const withReset = (err: ApiError) =>
        err.code === "visitor_full" || err.code === "day_full"
          ? `${err.message} It resets at midnight UTC.`
          : err.message;
      const why = !(e instanceof ApiError) ? "The recording could not be made just now." : e.code ? withReset(e) : "Recording is not available just now.";
      const written = e instanceof ApiError ? scriptLines(e.lines) : null;
      const how = canSpeak() ? "in your device's own voice" : "to read";
      const made: Made = {
        title: FALLBACK_TITLE,
        lines: written ?? neutralScript(wish.name.trim()),
        note: `${why} Here is ${written ? "your script" : "a general version"} ${how}.`,
        recording: null,
      };
      asked = wish;
      set({ making: false, made });
    }
    return;
  }

  // Original non-paywall path.
  const made = await makeManifestation(api, { ...wish, variant, ...chosen, voiceId, scriptMode }, canSpeak());
  // A newer request, or leaving the flow, replaces this one.
  if (run !== mine) return;
  asked = wish;
  set({ making: false, made });
}

/** Counts one free creation. False, with the gate shown, when a signed-out user has none left. A signed-in user is not held to the count (#164). */
function spend(): boolean {
  const { account, checked } = currentView();
  const access = createAccess(account, checked, state.used);
  // Still asking who is signed in: the button is disabled meanwhile, so this is only a guard.
  if (access === "checking") return false;
  if (access === "blocked") {
    set({ gate: true });
    return false;
  }
  const signedIn = isSignedIn(account);
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
