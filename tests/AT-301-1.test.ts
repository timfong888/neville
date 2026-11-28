// AT-301: Review script shows one status message that matches state, with a reference code.
//
// Bug (Tim, 2026-11-28): "The two messages conflict. We should be much clearer to the user
// and have only one and it is correctly representing state."
// Screenshot: three messages visible simultaneously:
//   1. "Use a fictional person..." (top note, grey) — initial generation note
//   2. "Recorded exactly as written. No rules are applied to your edits." (grey) — static
//   3. "This script can't be recorded. Your device's voice can still read it." (red) — rrError
// Only message 3 (red, state-driven) is correct; it's missing a trace id.
//
// Fix: a single ReviewStatus slot replaces all three. showTopNote() hides message 1 when
// rrError is set or when the user has edited. deriveReviewStatus() is the single source of
// truth for messages 2 and 3, including the support code.
//
// AT-5 (regression): these tests fail on current main because deriveReviewStatus and
// showTopNote are not exported from @/lib/reviewStatus (the file does not exist there yet).
import { describe, it, expect } from "vitest";
import { deriveReviewStatus, showTopNote } from "@/lib/reviewStatus";
import { FILTER_GUIDANCE } from "@/lib/scriptEdit";

const ATTEMPT_ID = "abc12345";
const SUPPORT_CODE = "ab12-3456";

describe("AT-301: deriveReviewStatus", () => {
  it("AT-1: editing state — no changes, no error — message is empty", () => {
    const s = deriveReviewStatus({ rrMessage: "", rrRefused: false, scriptDiffers: false, over: 0 });
    expect(s.state).toBe("editing");
    expect(s.message).toBe("");
    expect(s.isError).toBe(false);
  });

  it("AT-1: edited state — script differs, no error — shows edit hint", () => {
    const s = deriveReviewStatus({ rrMessage: "", rrRefused: false, scriptDiffers: true, over: 0 });
    expect(s.state).toBe("edited");
    expect(s.message).toBe("Edits are recorded exactly as written.");
    expect(s.isError).toBe(false);
  });

  it("AT-2: refused — rrError with not_recordable — only the rrError message, no edit hint", () => {
    const s = deriveReviewStatus({
      rrMessage: FILTER_GUIDANCE,
      rrCode: SUPPORT_CODE,
      rrRefused: true,
      scriptDiffers: true, // user DID edit — the edit hint must NOT appear
      over: 0,
    });
    expect(s.state).toBe("refused");
    expect(s.message).toBe(FILTER_GUIDANCE);
    expect(s.isError).toBe(true);
  });

  it("AT-2: refused — code is support code from response", () => {
    const s = deriveReviewStatus({ rrMessage: FILTER_GUIDANCE, rrCode: SUPPORT_CODE, rrRefused: true, scriptDiffers: false, over: 0 });
    expect(s.code).toBe(SUPPORT_CODE);
  });

  it("AT-3: code falls back to attemptId when no supportCode", () => {
    const s = deriveReviewStatus({ rrMessage: FILTER_GUIDANCE, rrCode: ATTEMPT_ID, rrRefused: true, scriptDiffers: false, over: 0 });
    expect(s.code).toBe(ATTEMPT_ID);
  });

  it("AT-3: failed state — non-refusal error — state is 'failed'", () => {
    const s = deriveReviewStatus({
      rrMessage: "The recording could not be made just now.",
      rrCode: SUPPORT_CODE,
      rrRefused: false,
      scriptDiffers: true,
      over: 0,
    });
    expect(s.state).toBe("failed");
    expect(s.isError).toBe(true);
    expect(s.code).toBe(SUPPORT_CODE);
  });

  it("AT-2: in refused state, the edit hint ('Edits are recorded exactly...') is absent", () => {
    // scriptDiffers=true would normally show the edit hint, but rrError wins
    const s = deriveReviewStatus({ rrMessage: FILTER_GUIDANCE, rrRefused: true, scriptDiffers: true, over: 0 });
    expect(s.message).not.toBe("Edits are recorded exactly as written.");
    expect(s.message).toBe(FILTER_GUIDANCE);
  });
});

describe("AT-301: showTopNote", () => {
  it("AT-4: top note is shown when note is set, no rrError, no edits", () => {
    expect(showTopNote("Use a fictional person.", "", false)).toBe(true);
  });

  it("AT-4: top note is hidden when rrError is set (rrError supersedes initial note)", () => {
    expect(showTopNote("Use a fictional person.", FILTER_GUIDANCE, false)).toBe(false);
  });

  it("AT-4: top note is hidden when user has edited the script (note describes initial gen)", () => {
    expect(showTopNote("Use a fictional person.", "", true)).toBe(false);
  });

  it("AT-4: top note is hidden when note is empty", () => {
    expect(showTopNote("", "", false)).toBe(false);
  });

  it("AT-1: exactly one status visible — refused state: rrError visible, top note hidden", () => {
    const topNoteVisible = showTopNote("Use a fictional person.", FILTER_GUIDANCE, false);
    const status = deriveReviewStatus({ rrMessage: FILTER_GUIDANCE, rrRefused: true, scriptDiffers: false, over: 0 });
    expect(topNoteVisible).toBe(false); // top note hidden
    expect(status.isError).toBe(true);  // only rrError message shown
  });
});
