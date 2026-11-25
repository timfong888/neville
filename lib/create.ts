// The Create flow's rules: a wish in, a script and its recording out. Framework-free,
// so the native app, the web build and tests share them. Wording matches app/page.tsx.
import { ApiError, type Api, type WishRequest } from "@/lib/api/client";
import { FREE_ANON_GENERATIONS } from "@/lib/architecture";
import { lineStarts } from "@/lib/audio";
import { MAX_NAME, MAX_WANT, type Draft } from "@/lib/draftStore";
import type { Manifestation } from "@/lib/library/model";
import { VARIANT_COUNT, neutralScript, scriptLines, titleFor } from "@/lib/script";
import { resolveVoice } from "@/lib/voices";

export { MAX_NAME, MAX_WANT };

export const EXAMPLES = [
  "I want to be calm and confident when I speak",
  "a healthy, strong body that I enjoy living in",
  "to run my own business doing work I love",
  "a loving, easy relationship with my family",
];

/** Where the free-creation count is kept on the device. */
export const FREE_STORAGE_KEY = "nv_free";

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

/** The wish as typed, and the choices from Settings. */
export type Wish = Draft & { voiceId?: string | null; variant?: number; pace?: unknown; tone?: unknown };

/** The body of `POST /api/manifest`. The server checks every field again. */
export function wishRequest(w: Wish): WishRequest {
  return {
    want: w.want.trim().slice(0, MAX_WANT),
    name: w.name.trim().slice(0, MAX_NAME),
    voiceId: resolveVoice(w.voiceId).id,
    variant: w.variant ?? 0,
    pace: w.pace,
    tone: w.tone,
  };
}

/** What the script and recording steps show. `recording` is null when only a script could be given. */
export type Made = {
  lines: string[];
  /** About the wish only when the server vetted it and recorded it. */
  title: string;
  /** Why this is not the recording that was asked for; empty when it is. */
  note: string;
  recording: { audio: ArrayBuffer; mime: string; voiceId: string; voiceName: string; starts: number[] } | null;
};

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
      title: titleFor(w.want),
      lines: r.lines,
      note: r.source === "template" ? "A personal script could not be written just now, so this is a general one." : "",
      recording: { audio: r.audio, mime: r.mime, voiceId: voice.id, voiceName: voice.name, starts: r.starts ?? lineStarts(r.lines) },
    };
  } catch (e) {
    const why = !(e instanceof ApiError) ? "The recording could not be made just now." : e.code ? e.message : "Recording is not available just now.";
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

/** The Library item for a result, as the website's Save builds it. */
export function toManifestation(made: Made, w: Draft, id: string, now = Date.now()): Manifestation {
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
  };
}
