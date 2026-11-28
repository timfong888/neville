// Pure state machine for the library item re-record flow (#206). No React, no network.

export type RerecordStatus =
  | "idle"               // the item has a recording; no pending action
  | "saved_not_recorded" // script saved without audio; Record button is live
  | "recording"          // POST /api/rerecord in flight
  | "charged"            // server confirmed the charge; balance shown
  | "done"               // recording saved; autoplaying
  | "failed"             // server or network error
  | "no_credits";        // 402 from the server

export type RerecordState = {
  status: RerecordStatus;
  /** Credits balance after charging. "unlimited" for testers, digit string, or null when not known. */
  balance: string | null;
  /** Human-readable failure message. Set in failed state only. */
  failReason: string | null;
  /** True when the failure refunded the credit (shown as "Your credit was returned."). */
  creditReturned: boolean;
  /** API error code when known: "not_recordable" or "voice_failed". */
  failCode?: string;
  /** Actionable suggestions from the server, shown below the error message. */
  failHint?: string;
  /** Short support reference code (8 hex chars) for the failed attempt. Shown with Copy button. */
  supportCode?: string;
  /** Full attempt ID for the Copy button's clipboard text. */
  attemptId?: string;
};

export type RerecordEvent =
  | { type: "edit_saved" }
  | { type: "record_tap" }
  | { type: "server_charged"; balance: string | null }
  | { type: "server_done" }
  | { type: "server_failed"; reason: string; creditReturned: boolean; code?: string; hint?: string; supportCode?: string; attemptId?: string }
  | { type: "server_402" };

export const INITIAL_STATE: RerecordState = {
  status: "idle",
  balance: null,
  failReason: null,
  creditReturned: false,
};

export function savedNotRecorded(): RerecordState {
  return { status: "saved_not_recorded", balance: null, failReason: null, creditReturned: false };
}

/** Returns the same object when no transition applies (identity = no re-render). */
export function transition(state: RerecordState, event: RerecordEvent): RerecordState {
  switch (event.type) {
    case "edit_saved":
      return { status: "saved_not_recorded", balance: null, failReason: null, creditReturned: false };

    case "record_tap":
      if (state.status === "recording") return state; // double-tap guard
      if (state.status !== "saved_not_recorded" && state.status !== "idle" && state.status !== "failed" && state.status !== "no_credits") return state;
      return { status: "recording", balance: null, failReason: null, creditReturned: false };

    case "server_charged":
      if (state.status !== "recording") return state;
      return { ...state, status: "charged", balance: event.balance };

    case "server_done":
      if (state.status !== "charged") return state;
      return { ...state, status: "done" };

    case "server_failed":
      if (state.status !== "recording" && state.status !== "charged") return state;
      return {
        status: "failed",
        balance: null,
        failReason: event.reason,
        creditReturned: event.creditReturned,
        ...(event.code ? { failCode: event.code } : {}),
        ...(event.hint ? { failHint: event.hint } : {}),
        ...(event.supportCode ? { supportCode: event.supportCode } : {}),
        ...(event.attemptId ? { attemptId: event.attemptId } : {}),
      };

    case "server_402":
      if (state.status !== "recording") return state;
      return { status: "no_credits", balance: null, failReason: null, creditReturned: false };

    default:
      return state;
  }
}
