// Session length planning (#236). Framework-free; no browser or native APIs.
//
// A session either runs until stopped, plays a fixed number of loops, or runs for
// approximately a chosen number of minutes, stopping only after a whole loop finishes.

export type SessionMode = "until-stopped" | "loops" | "time";
export const SESSION_MODES: readonly SessionMode[] = ["until-stopped", "loops", "time"];
export const DEFAULT_SESSION_MODE: SessionMode = "until-stopped";

/** Minutes shown in the Time picker. */
export const TIME_OPTIONS = [5, 10, 15, 20, 30, 45, 60] as const;
export const MAX_LOOPS = 20;
export const DEFAULT_LOOPS = 3;
export const DEFAULT_TIME = 10;

export type SessionPlan = {
  /** null means until-stopped. */
  loops: number | null;
  /** Total seconds the session will run. null means until-stopped. */
  totalSeconds: number | null;
  /** When the session will end, based on `now`. null means until-stopped. */
  endsAt: Date | null;
};

/**
 * Returns a plan for a playback session.
 *
 * @param durations - Seconds per loop, including any gap after the voice.
 *   For a single item: `[voiceSeconds + gapSeconds]`.
 *   For Play all: `[totalSecondsForOneFullPlaylistPass]`.
 * @param mode     - "until-stopped" | "loops" | "time"
 * @param target   - Integer loop count (loops mode) or minutes (time mode).
 *                   Ignored for until-stopped.
 * @param now      - Seed for endsAt; defaults to new Date().
 */
export function planSession(
  durations: number[],
  mode: SessionMode,
  target: number,
  now = new Date(),
): SessionPlan {
  if (mode === "until-stopped" || durations.length === 0) {
    return { loops: null, totalSeconds: null, endsAt: null };
  }

  const dur = (i: number) => Math.max(0, durations[i % durations.length]);

  if (mode === "loops") {
    const loops = Math.max(1, Math.min(MAX_LOOPS, Math.round(target)));
    let totalSeconds = 0;
    for (let i = 0; i < loops; i++) totalSeconds += dur(i);
    return { loops, totalSeconds, endsAt: new Date(now.getTime() + totalSeconds * 1000) };
  }

  // time mode: play whole loops; stop after the last that finishes within target.
  const targetSecs = target * 60;
  const loopDur = dur(0); // single-item path: all loops same length
  if (loopDur <= 0) return { loops: 1, totalSeconds: 0, endsAt: now };
  // floor → rounds down. max(1, …) → if one loop is longer than the target, play it once.
  const loops = Math.max(1, Math.floor(targetSecs / loopDur));
  let totalSeconds = 0;
  for (let i = 0; i < loops; i++) totalSeconds += dur(i);
  return { loops, totalSeconds, endsAt: new Date(now.getTime() + totalSeconds * 1000) };
}
