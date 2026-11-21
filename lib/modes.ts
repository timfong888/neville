// Framework-free: no Next, React or browser APIs. A mode is a preset over the
// other settings: pace and tone for new recordings, and music, its volume and
// the pause between tracks for playback. Choosing a mode writes those settings;
// changing any of them afterwards is an override and sticks.
import type { PaceId, ToneId } from "@/lib/delivery";
import type { MusicChoice } from "@/lib/music";

export type ModeId = "calm" | "sleep" | "active";

export type Mode = {
  id: ModeId;
  label: string;
  note: string;
  pace: PaceId;
  tone: ToneId;
  music: MusicChoice;
  /** Music slider position, 0 to 1. */
  volume: number;
  /** Silence between two manifestations in a playlist, ms. */
  gapMs: number;
  /** Seconds for the music to fade in: no sudden start at night. */
  fadeInS: number;
  /** Offer the sleep timer on the player. */
  sleepTimer: boolean;
  /** A voice this mode records in (turns Mix voices off). Omitted: keep the chosen voice. */
  voiceId?: string;
};

export const MODES: readonly Mode[] = [
  {
    id: "calm",
    label: "Calm",
    note: "Slow and warm, gentle piano. The everyday default.",
    pace: "slow",
    tone: "calm",
    music: "morning-light",
    volume: 0.6,
    gapMs: 2500,
    fadeInS: 2,
    sleepTimer: false,
  },
  {
    id: "sleep",
    label: "Sleep",
    note: "Very slow and hushed, long pauses, low warm music, and a sleep timer that fades out.",
    pace: "very-slow",
    tone: "sleep",
    music: "night-tide",
    volume: 0.45,
    gapMs: 6000,
    fadeInS: 8,
    sleepTimer: true,
  },
  {
    id: "active",
    label: "Active",
    note: "Brisk, with Charon as a calm, confident coach, short pauses and upbeat music. For mornings and walks.",
    pace: "brisk",
    tone: "energetic",
    music: "rise",
    volume: 0.8,
    gapMs: 1200,
    fadeInS: 1,
    sleepTimer: false,
    // Tim picked Charon from the Active candidates (#45).
    voiceId: "gemini-charon",
  },
];

export const DEFAULT_MODE_ID: ModeId = "calm";

export function resolveMode(id: unknown): Mode {
  return MODES.find((m) => m.id === id) ?? MODES.find((m) => m.id === DEFAULT_MODE_ID)!;
}

/** Sleep timer choices, in minutes. 0 is off. */
export const SLEEP_TIMER_MINUTES = [0, 15, 30, 60] as const;

/** Everything fades to silence over the last minute of a sleep timer (or all of it, if shorter). */
export const SLEEP_FADE_S = 60;

/** Where a sleep timer stands at `now`: still playing, fading (with seconds left), or over. */
export function sleepState(endsAt: number | null, now: number): { kind: "off" | "playing" | "fading" | "over"; left: number } {
  if (endsAt === null) return { kind: "off", left: Infinity };
  const left = (endsAt - now) / 1000;
  if (left <= 0) return { kind: "over", left: 0 };
  if (left <= SLEEP_FADE_S) return { kind: "fading", left };
  return { kind: "playing", left };
}
