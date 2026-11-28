// Pure helpers for the edit-and-re-record feature on the recording screen.
// No React, no network: used by the web page, the native screen, and tests.
import { linesFromText, sameLines } from "@/lib/library/model";

export { linesFromText };

/** True when the edited textarea text has at least one line that differs from the original. */
export function editEnablesRerecord(original: string[], editedText: string): boolean {
  const edited = linesFromText(editedText);
  return edited.length > 0 && !sameLines(edited, original);
}

/** Guidance note when the safety filter refuses a re-record. */
export const FILTER_GUIDANCE =
  "This script can't be recorded. Your device's voice can still read it.";

/** User-facing error from a failed re-record response. `code === "not_recordable"` shows the guidance note. */
export function rrErrorMessage(
  code: string | undefined,
  error: string | undefined,
): string {
  if (code === "not_recordable") return FILTER_GUIDANCE;
  return error ?? "The recording could not be made just now.";
}

/**
 * Returns the url and error to show after a re-record attempt.
 * On failure the previous url is kept so the old audio stays playable.
 */
export function applyRRResult(
  prevUrl: string | null,
  result: { ok: true; url: string } | { ok: false; error: string },
): { url: string | null; error: string | null } {
  if (!result.ok) return { url: prevUrl, error: result.error };
  return { url: result.url, error: null };
}

/**
 * State machine for the undo-aware re-record cycle.
 * `prev` is the item before re-recording; null means no undo is available.
 */
export type RRUndoState<T> = { current: T; prev: T | null };

/** Applies a successful re-record: `current` becomes the new item; `prev` stores the old for undo. */
export function applyRerecord<T>(state: RRUndoState<T>, newItem: T): RRUndoState<T> {
  return { current: newItem, prev: state.current };
}

/** Undoes the last re-record: restores `prev` as `current` and clears the undo slot. */
export function undoRerecord<T>(state: RRUndoState<T>): RRUndoState<T> {
  if (!state.prev) return state;
  return { current: state.prev, prev: null };
}
