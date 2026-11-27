// The Create flow's rules: a wish in, a script and its recording out. Framework-free,
// so the native app, the web build and tests share them. Wording matches app/page.tsx.
import { ApiError, type Api, type WishRequest } from "@/lib/api/client";
import { FREE_ANON_GENERATIONS } from "@/lib/architecture";
import { lineStarts } from "@/lib/audio";
import { MAX_NAME, MAX_WANT, type Draft } from "@/lib/draftStore";
import type { Manifestation } from "@/lib/library/model";
import { VARIANT_COUNT, displayTitle, neutralScript, scriptLines, toYouStatement } from "@/lib/script";
import { resolveVoice } from "@/lib/voices";

export { MAX_NAME, MAX_WANT };

export const EXAMPLES = [
  "I am calm and confident when I speak",
  "I am healthy and strong",
  "I run my own business doing work I love",
  "I have a loving, easy relationship with my family",
];

/** Where the free-creation count is kept on the device. */
export const FREE_STORAGE_KEY = "nv_free";
/** Where the script mode choice is kept on the device. */
export const SCRIPT_MODE_KEY = "nv_script_mode";
export type ScriptMode = "exact" | "enhance";

/** The count as stored; anything unreadable is zero. */
export const parseCount = (raw: string | null): number => {
  const n = Number(raw ?? "0");
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
};
/** Free creations left on this device without an account. */
export const freeLeft = (used: number): number => Math.max(0, FREE_ANON_GENERATIONS - used);
export const freeBanner = (used: number): string => {
  const left = freeLeft(used);
  return left > 0 ? `${left} free ${left === 1 ? "creation" : "creations"} left without an account.` : "You have used your free creations.";
};
export const nextVariant = (v: number): number => (v + 1) % VARIANT_COUNT;

/** The title when there is no recording. It is not about the wish, as on the website's Save. */
export const FALLBACK_TITLE = "A moment of calm";

/**
 * The voice for the next recording: the one picked on the Create page when it may be
 * recorded, else the Settings choice. Picking on Create does not change Settings (#150).
 */
export function voiceFor(picked: string | null | undefined, settingsVoiceId: string | null | undefined): string {
  return picked && resolveVoice(picked).id === picked ? picked : resolveVoice(settingsVoiceId).id;
}

/** What Create remembers about the voice: its own pick, and the Settings voice it last saw. */
export type VoicePick = { picked: string | null; settingsVoice: string | null };
export const NO_PICK: VoicePick = { picked: null, settingsVoice: null };

/**
 * Called with the Settings voice each time it is read. A pick on Create lasts until the
 * Settings voice changes: a newer choice there wins. The first reading clears nothing.
 */
export function seeSettingsVoice(p: VoicePick, settingsVoiceId: string): VoicePick & { voiceId: string } {
  const changed = p.settingsVoice !== null && p.settingsVoice !== settingsVoiceId;
  const picked = changed ? null : p.picked;
  return { picked, settingsVoice: settingsVoiceId, voiceId: voiceFor(picked, settingsVoiceId) };
}

/**
 * A voice picked on Create. `asDefault` means the caller also saves it to Settings, so it is
 * recorded as the Settings voice here and that write does not clear the pick.
 */
export function pickOnCreate(p: VoicePick, id: string, current: string, asDefault = false): VoicePick & { voiceId: string } {
  const voiceId = voiceFor(id, current);
  return { picked: voiceId, settingsVoice: asDefault ? voiceId : p.settingsVoice, voiceId };
}

/** The wish as typed, and the choices from Settings. */
export type Wish = Draft & { voiceId?: string | null; variant?: number; pace?: unknown; tone?: unknown; speedStep?: unknown; cadenceStep?: unknown; scriptMode?: ScriptMode };

/** The body of `POST /api/manifest`. The server checks every field again. */
export function wishRequest(w: Wish): WishRequest {
  return {
    want: w.want.trim().slice(0, MAX_WANT),
    name: w.name.trim().slice(0, MAX_NAME),
    voiceId: resolveVoice(w.voiceId).id,
    variant: w.variant ?? 0,
    pace: w.pace,
    tone: w.tone,
    speedStep: w.speedStep,
    cadenceStep: w.cadenceStep,
    ...(w.scriptMode === "exact" ? { scriptMode: "exact" as const } : {}),
  };
}

/** What the script and recording steps show. `recording` is null when only a script could be given. */
export type Made = {
  lines: string[];
  /** About the wish only when the server vetted it and recorded it. */
  title: string;
  /** Why this is not the recording that was asked for, or which mode was used. */
  note: string;
  recording: { audio: ArrayBuffer; mime: string; voiceId: string; voiceName: string; starts: number[] } | null;
  /** "exact" when the script uses the person's own sentences unchanged. */
  scriptMode?: "exact";
};

/** The server's words, plus when a daily limit lifts: its day is the UTC date (lib/limits.ts). */
const withReset = (e: ApiError): string => (e.code === "visitor_full" || e.code === "day_full" ? `${e.message} It resets at midnight UTC.` : e.message);

/** The user-facing note when the server returned a template script instead of a personal one. */
export function noteForReason(reason: string | undefined, term?: string): string {
  if (reason === "withheld") {
    return term
      ? `The word "${term}" held this wish back. Try describing adults only. This is a general script.`
      : "That wish was held back. Try describing adults only. This is a general script.";
  }
  return "A personal script could not be written just now, so this is a general one.";
}

/**
 * One request writes the script and records it. A refusal or failure still gives
 * a script: the server's own when only the voice failed, else a general one. It
 * never reads the typed wish back: only the server's text model vets a wish.
 * `deviceVoice` says whether this device can speak the script itself.
 */
export async function makeManifestation(api: Pick<Api, "manifest">, w: Wish, deviceVoice: boolean): Promise<Made> {
  try {
    const r = await api.manifest(wishRequest(w));
    const voice = resolveVoice(r.voiceId);
    return {
      title: r.source === "template" ? FALLBACK_TITLE : (r.title ?? displayTitle(toYouStatement(w.want))),
      lines: r.lines,
      note: r.source === "template" ? noteForReason(r.reason, r.term) : r.scriptMode === "exact" ? "Your exact words." : "",
      recording: { audio: r.audio, mime: r.mime, voiceId: voice.id, voiceName: voice.name, starts: r.starts ?? lineStarts(r.lines) },
      ...(r.scriptMode === "exact" ? { scriptMode: "exact" as const } : {}),
    };
  } catch (e) {
    const why = !(e instanceof ApiError) ? "The recording could not be made just now." : e.code ? withReset(e) : "Recording is not available just now.";
    const written = e instanceof ApiError ? scriptLines(e.lines) : null;
    const how = deviceVoice ? "in your device's own voice" : "to read";
    return {
      // Nothing typed is shown back when the request failed: not in the script, not in the title.
      title: FALLBACK_TITLE,
      lines: written ?? neutralScript(w.name.trim()),
      note: `${why} Here is ${written ? "your script" : "a general version"} ${how}.`,
      recording: null,
    };
  }
}

/** The line being spoken at `at`, a share of the clip from 0 to 1. */
export function lineAt(starts: number[], at: number): number {
  let i = 0;
  while (i + 1 < starts.length && starts[i + 1] <= at) i++;
  return i;
}

/**
 * Which script line is spoken at progress `at` (0–1) in a Player queue clip at `index`.
 * The queue alternates recording clips (even indices) and gap clips (odd indices).
 * Returns null for a gap clip — the line display should hold its last value instead.
 */
export function lineForProgress(index: number, at: number, starts: number[]): number | null {
  if (index % 2 === 1) return null; // gap clip between recordings
  return lineAt(starts, at);
}

/** Label for the "go to playlist" button on the recording screen. */
export const playlistLabel = (savedId: string): string =>
  savedId ? "My playlist" : "Save and open playlist";

/** The Library tab route in the native app. */
export const LIBRARY_TAB_ROUTE = "/(tabs)/library" as const;

/** The Library route on the web. */
export const LIBRARY_WEB_ROUTE = "/library" as const;

/** The Library item for a result, as the website's Save builds it. */
export function toManifestation(made: Made, w: Wish, id: string, now = Date.now()): Manifestation {
  return {
    id,
    title: made.title,
    want: w.want.trim(),
    firstName: w.name.trim(),
    lines: made.lines,
    voiceId: made.recording?.voiceId ?? "",
    voiceName: made.recording?.voiceName ?? "Device voice",
    hasAudio: !!made.recording,
    createdAt: now,
    updatedAt: now,
    ...(typeof w.speedStep === "string" ? { speedStep: w.speedStep } : {}),
    ...(typeof w.cadenceStep === "string" ? { cadenceStep: w.cadenceStep } : {}),
  };
}
