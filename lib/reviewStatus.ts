// Pure helpers for the ReviewStatus slot on the Review script screen (issue 301).
// No React, no network: shared by tests and the native screen.
import { FILTER_GUIDANCE } from "@/lib/scriptEdit";

export type ReviewState = "editing" | "edited" | "refused" | "failed";

export type ReviewStatusData = {
  state: ReviewState;
  /** User-facing message; empty string means nothing to show. */
  message: string;
  /** Support code (from ApiError.data.supportCode, or attemptId fallback). */
  code?: string;
  isError: boolean;
};

/**
 * Derives the single status to show in the Review slot.
 * When rrMessage is set it wins; otherwise the edit state is derived from scriptDiffers.
 */
export function deriveReviewStatus(opts: {
  rrMessage: string;
  rrCode?: string;
  rrRefused: boolean;
  scriptDiffers: boolean;
  over: number;
}): ReviewStatusData {
  if (opts.rrMessage) {
    return {
      state: opts.rrRefused ? "refused" : "failed",
      message: opts.rrMessage,
      code: opts.rrCode,
      isError: true,
    };
  }
  if (opts.scriptDiffers && opts.over === 0) {
    return { state: "edited", message: "Edits are recorded exactly as written.", isError: false };
  }
  return { state: "editing", message: "", isError: false };
}

/**
 * Whether the top-of-screen note (c.made.note) should be shown.
 * Hidden when rrMessage is set (the error is more current) or when the user
 * has edited the script (their edits make the initial-generation note false).
 */
export function showTopNote(note: string, rrMessage: string, scriptDiffers: boolean): boolean {
  if (!note) return false;
  if (rrMessage) return false;
  if (scriptDiffers) return false;
  return true;
}

/** The edit-hint shown above the script box; different from the status slot. */
export const EDIT_HINT = "✏ Tap to edit any word.";

/**
 * The refusal guidance text. Exported so callers can check identity rather than
 * parsing the string.
 */
export { FILTER_GUIDANCE };
