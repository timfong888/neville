import { describe, expect, it } from "vitest";
import {
  INITIAL_STATE,
  savedNotRecorded,
  transition,
  type RerecordState,
} from "@/lib/rerecordState";

const idle = INITIAL_STATE;
const snr = savedNotRecorded();
const recording: RerecordState = { status: "recording", balance: null, failReason: null, creditReturned: false };
const charged: RerecordState = { status: "charged", balance: "4", failReason: null, creditReturned: false };
const done: RerecordState = { status: "done", balance: "4", failReason: null, creditReturned: false };
const failed: RerecordState = { status: "failed", balance: null, failReason: "oops", creditReturned: false };

describe("rerecordState", () => {
  describe("edit_saved", () => {
    it("transitions from idle to saved_not_recorded", () => {
      expect(transition(idle, { type: "edit_saved" }).status).toBe("saved_not_recorded");
    });

    it("transitions from failed to saved_not_recorded", () => {
      expect(transition(failed, { type: "edit_saved" }).status).toBe("saved_not_recorded");
    });

    it("transitions from no_credits to saved_not_recorded", () => {
      const nc: RerecordState = { status: "no_credits", balance: null, failReason: null, creditReturned: false };
      expect(transition(nc, { type: "edit_saved" }).status).toBe("saved_not_recorded");
    });

    it("transitions from done to saved_not_recorded", () => {
      expect(transition(done, { type: "edit_saved" }).status).toBe("saved_not_recorded");
    });

    it("clears all previous data", () => {
      const next = transition(failed, { type: "edit_saved" });
      expect(next.balance).toBeNull();
      expect(next.failReason).toBeNull();
      expect(next.creditReturned).toBe(false);
    });
  });

  describe("record_tap", () => {
    it("transitions from saved_not_recorded to recording", () => {
      expect(transition(snr, { type: "record_tap" }).status).toBe("recording");
    });

    it("does nothing while recording — double-tap guard", () => {
      const next = transition(recording, { type: "record_tap" });
      expect(next).toBe(recording); // identity: same object
    });

    it("does nothing from idle", () => {
      const next = transition(idle, { type: "record_tap" });
      expect(next).toBe(idle);
    });

    it("does nothing from done", () => {
      const next = transition(done, { type: "record_tap" });
      expect(next).toBe(done);
    });

    it("does nothing from failed", () => {
      const next = transition(failed, { type: "record_tap" });
      expect(next).toBe(failed);
    });

    it("does nothing from no_credits", () => {
      const nc: RerecordState = { status: "no_credits", balance: null, failReason: null, creditReturned: false };
      expect(transition(nc, { type: "record_tap" })).toBe(nc);
    });
  });

  describe("server_charged", () => {
    it("transitions from recording to charged with numeric balance", () => {
      const next = transition(recording, { type: "server_charged", balance: "4" });
      expect(next.status).toBe("charged");
      expect(next.balance).toBe("4");
    });

    it('carries "unlimited" balance for testers', () => {
      const next = transition(recording, { type: "server_charged", balance: "unlimited" });
      expect(next.status).toBe("charged");
      expect(next.balance).toBe("unlimited");
    });

    it("carries null balance when header absent", () => {
      const next = transition(recording, { type: "server_charged", balance: null });
      expect(next.status).toBe("charged");
      expect(next.balance).toBeNull();
    });

    it("does nothing when not in recording state", () => {
      expect(transition(snr, { type: "server_charged", balance: "4" })).toBe(snr);
    });
  });

  describe("server_done", () => {
    it("transitions from charged to done", () => {
      expect(transition(charged, { type: "server_done" }).status).toBe("done");
    });

    it("preserves balance on done", () => {
      expect(transition(charged, { type: "server_done" }).balance).toBe("4");
    });

    it("does nothing from recording (must go through charged first)", () => {
      const next = transition(recording, { type: "server_done" });
      expect(next).toBe(recording);
    });

    it("does nothing from saved_not_recorded", () => {
      expect(transition(snr, { type: "server_done" })).toBe(snr);
    });
  });

  describe("server_failed", () => {
    it("transitions from recording to failed with reason", () => {
      const next = transition(recording, { type: "server_failed", reason: "Voice error.", creditReturned: false });
      expect(next.status).toBe("failed");
      expect(next.failReason).toBe("Voice error.");
      expect(next.creditReturned).toBe(false);
    });

    it("stores failCode when server sends not_recordable", () => {
      const next = transition(recording, { type: "server_failed", reason: "Content blocked.", creditReturned: false, code: "not_recordable" });
      expect(next.status).toBe("failed");
      expect(next.failCode).toBe("not_recordable");
    });

    it("stores failCode when server sends voice_failed", () => {
      const next = transition(recording, { type: "server_failed", reason: "Provider error.", creditReturned: true, code: "voice_failed" });
      expect(next.failCode).toBe("voice_failed");
    });

    it("leaves failCode undefined when no code is given", () => {
      const next = transition(recording, { type: "server_failed", reason: "oops", creditReturned: false });
      expect(next.failCode).toBeUndefined();
    });

    it("stores hint for not_recordable", () => {
      const next = transition(recording, { type: "server_failed", reason: "Content blocked.", creditReturned: false, code: "not_recordable", hint: "Try softer phrasing." });
      expect(next.failHint).toBe("Try softer phrasing.");
    });

    it("stores hint for voice_failed", () => {
      const next = transition(recording, { type: "server_failed", reason: "Provider error.", creditReturned: true, code: "voice_failed", hint: "Try again later." });
      expect(next.failHint).toBe("Try again later.");
    });

    it("leaves failHint undefined when no hint is given", () => {
      const next = transition(recording, { type: "server_failed", reason: "oops", creditReturned: false });
      expect(next.failHint).toBeUndefined();
    });

    it("sets creditReturned when server says so", () => {
      const next = transition(recording, { type: "server_failed", reason: "Timed out.", creditReturned: true });
      expect(next.creditReturned).toBe(true);
    });

    it("does not set creditReturned when nothing was charged", () => {
      const next = transition(recording, { type: "server_failed", reason: "oops", creditReturned: false });
      expect(next.creditReturned).toBe(false);
    });

    it("transitions from charged to failed (edge case)", () => {
      const next = transition(charged, { type: "server_failed", reason: "oops", creditReturned: false });
      expect(next.status).toBe("failed");
    });

    it("does nothing from idle", () => {
      expect(transition(idle, { type: "server_failed", reason: "oops", creditReturned: false })).toBe(idle);
    });

    it("does nothing from saved_not_recorded", () => {
      expect(transition(snr, { type: "server_failed", reason: "oops", creditReturned: false })).toBe(snr);
    });

    it("clears balance on failure", () => {
      const next = transition(charged, { type: "server_failed", reason: "oops", creditReturned: false });
      expect(next.balance).toBeNull();
    });
  });

  describe("server_402", () => {
    it("transitions from recording to no_credits", () => {
      expect(transition(recording, { type: "server_402" }).status).toBe("no_credits");
    });

    it("does nothing from saved_not_recorded", () => {
      expect(transition(snr, { type: "server_402" })).toBe(snr);
    });

    it("does nothing from idle", () => {
      expect(transition(idle, { type: "server_402" })).toBe(idle);
    });
  });

  describe("full happy path", () => {
    it("idle → saved_not_recorded → recording → charged → done", () => {
      let s = idle;
      s = transition(s, { type: "edit_saved" });
      expect(s.status).toBe("saved_not_recorded");
      s = transition(s, { type: "record_tap" });
      expect(s.status).toBe("recording");
      s = transition(s, { type: "server_charged", balance: "4" });
      expect(s.status).toBe("charged");
      expect(s.balance).toBe("4");
      s = transition(s, { type: "server_done" });
      expect(s.status).toBe("done");
    });
  });

  describe("full tester path", () => {
    it("tester sees unlimited balance; no draw-down", () => {
      let s = snr;
      s = transition(s, { type: "record_tap" });
      s = transition(s, { type: "server_charged", balance: "unlimited" });
      expect(s.status).toBe("charged");
      expect(s.balance).toBe("unlimited");
      s = transition(s, { type: "server_done" });
      expect(s.status).toBe("done");
    });
  });

  describe("failure paths", () => {
    it("failure without credit returned", () => {
      let s = snr;
      s = transition(s, { type: "record_tap" });
      s = transition(s, { type: "server_failed", reason: "Voice unavailable.", creditReturned: false });
      expect(s.status).toBe("failed");
      expect(s.creditReturned).toBe(false);
    });

    it("failure with credit returned", () => {
      let s = snr;
      s = transition(s, { type: "record_tap" });
      s = transition(s, { type: "server_failed", reason: "Timed out.", creditReturned: true });
      expect(s.status).toBe("failed");
      expect(s.creditReturned).toBe(true);
    });

    it("402 path", () => {
      let s = snr;
      s = transition(s, { type: "record_tap" });
      expect(s.status).toBe("recording");
      s = transition(s, { type: "server_402" });
      expect(s.status).toBe("no_credits");
    });
  });
});
