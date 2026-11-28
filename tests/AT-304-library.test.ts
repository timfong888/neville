// AT-304 acceptance tests: Library detail screen shows reference code and correct message.
//
// AT-5: the state machine carries supportCode and attemptId on failure, so the Library
// screen can render the reference code with Copy and show exactly one message per state.
//
// Tests the pure state machine (lib/rerecordState.ts); the React component is verified
// manually per the TEST steps in the PR description.
import { describe, expect, it } from "vitest";
import { INITIAL_STATE, savedNotRecorded, transition, type RerecordState } from "@/lib/rerecordState";

const recording: RerecordState = { status: "recording", balance: null, failReason: null, creditReturned: false };

describe("AT-5: Library detail screen state — supportCode and attemptId on refusal", () => {
  it("server_failed with supportCode stores it in state — fails on main without fix", () => {
    const next = transition(recording, {
      type: "server_failed",
      reason: "The script has content this service won't record in a synthetic voice.",
      creditReturned: false,
      code: "not_recordable",
      hint: "Hard limits apply.",
      supportCode: "a1b2c3d4",
      attemptId: "a1b2c3d4-0000-0000-0000-000000000000",
    });
    expect(next.status).toBe("failed");
    expect(next.supportCode).toBe("a1b2c3d4");
    expect(next.attemptId).toBe("a1b2c3d4-0000-0000-0000-000000000000");
  });

  it("server_failed without supportCode leaves supportCode undefined (backward-compat)", () => {
    const next = transition(recording, {
      type: "server_failed",
      reason: "Error.",
      creditReturned: false,
    });
    expect(next.supportCode).toBeUndefined();
    expect(next.attemptId).toBeUndefined();
  });

  it("edit_saved clears supportCode (new script, old code is irrelevant)", () => {
    const failed: RerecordState = {
      status: "failed",
      balance: null,
      failReason: "blocked",
      creditReturned: false,
      supportCode: "a1b2c3d4",
      attemptId: "a1b2c3d4-0000-0000-0000-000000000000",
    };
    const next = transition(failed, { type: "edit_saved" });
    expect(next.status).toBe("saved_not_recorded");
    expect(next.supportCode).toBeUndefined();
    expect(next.attemptId).toBeUndefined();
  });

  it("record_tap from failed clears supportCode (new attempt, fresh state)", () => {
    const failed: RerecordState = {
      status: "failed",
      balance: null,
      failReason: "blocked",
      creditReturned: false,
      supportCode: "a1b2c3d4",
      attemptId: "a1b2c3d4-0000-0000-0000-000000000000",
    };
    const next = transition(failed, { type: "record_tap" });
    expect(next.status).toBe("recording");
    expect(next.supportCode).toBeUndefined();
    expect(next.attemptId).toBeUndefined();
  });

  it("not_recordable with adult-tier hint does not contain standard advice", () => {
    const adultHint = "This script has content that won't record even on the adult tier. Hard limits apply to all accounts: minors, real named people, non-consent, harm to others, and family roles. Remove any of those and try again.";
    const next = transition(recording, {
      type: "server_failed",
      reason: "The script has content this service won't record in a synthetic voice.",
      creditReturned: false,
      code: "not_recordable",
      hint: adultHint,
      supportCode: "a1b2c3d4",
    });
    expect(next.failHint).not.toMatch(/replace explicit body/i);
    expect(next.failHint).not.toMatch(/warm, alive, connected/i);
  });

  it("not_recordable with standard hint contains the softer-language advice", () => {
    const stdHint = "Sexual, violent, or harmful wording triggers this. To raise the chance it records: replace explicit body or desire language with general terms (warm, alive, connected); keep each line as a personal affirmation about your own feelings or goals; shorten the script if any lines are long. You can also hear the script now in your device's own voice.";
    const next = transition(recording, {
      type: "server_failed",
      reason: "The script has content this service won't record in a synthetic voice.",
      creditReturned: false,
      code: "not_recordable",
      hint: stdHint,
    });
    expect(next.failHint).toMatch(/warm, alive, connected/i);
  });

  // AT-5: exactly one message per state — verified via state fields
  it("idle state: no message fields set", () => {
    const s = INITIAL_STATE;
    expect(s.failReason).toBeNull();
    expect(s.failHint).toBeUndefined();
    expect(s.supportCode).toBeUndefined();
  });

  it("saved_not_recorded state: no message fields set", () => {
    const s = savedNotRecorded();
    expect(s.failReason).toBeNull();
    expect(s.failHint).toBeUndefined();
    expect(s.supportCode).toBeUndefined();
  });

  it("recording state: no stale message fields", () => {
    const s = transition(INITIAL_STATE, { type: "record_tap" });
    expect(s.failReason).toBeNull();
    expect(s.failHint).toBeUndefined();
    expect(s.supportCode).toBeUndefined();
  });
});
