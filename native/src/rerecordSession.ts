// App-level store for the library item re-record flow (#206). Lives outside any
// screen, so the HTTP request keeps running when the user navigates away.
// Pattern follows native/src/create/session.ts.
import { useSyncExternalStore } from "react";
import { type RerecordEvent, type RerecordState, INITIAL_STATE, savedNotRecorded, transition } from "@/lib/rerecordState";
import { ApiError } from "@/lib/api/client";
import { detectPaywallError } from "@/lib/paywall";
import { resolveVoice } from "@/lib/voices";
import type { Manifestation } from "@/lib/library/model";
import { PAYWALL_ENABLED } from "./config";
import { api } from "./api";
import { library } from "./seams/library";
import { audio } from "./seams/audio";
import { nowPlaying } from "./player/nowPlayingStore";
import { refreshCredits } from "./creditsStore";

type Session = { id: string; state: RerecordState };
let session: Session = { id: "", state: INITIAL_STATE };

const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

function setState(id: string, state: RerecordState): void {
  session = { id, state };
  notify();
}

function dispatch(id: string, event: RerecordEvent): RerecordState {
  if (session.id !== id) return INITIAL_STATE;
  const next = transition(session.state, event);
  if (next !== session.state) setState(id, next);
  return next;
}

/**
 * Called when the library detail screen mounts. If the item is the active
 * session, its in-flight state is kept. Otherwise resets for this id.
 */
export function initSession(id: string, hasAudio: boolean): void {
  if (session.id === id) return; // already tracking: keep state across nav
  setState(id, hasAudio ? INITIAL_STATE : savedNotRecorded());
}

/** Fire after saving an edit that removes the audio. */
export function editSaved(id: string): void {
  if (session.id !== id) {
    setState(id, savedNotRecorded());
  } else {
    dispatch(id, { type: "edit_saved" });
  }
}

/** Start a re-recording for `m`. Idempotent if already recording (double-tap guard). */
export async function startRecording(m: Manifestation): Promise<void> {
  const id = m.id;
  const after = dispatch(id, { type: "record_tap" });
  if (after.status !== "recording") return; // guard rejected (double-tap or wrong state)

  const voiceId = resolveVoice(m.voiceId).id;

  try {
    const r = await api.rerecord(m.lines, voiceId, { speedStep: m.speedStep, cadenceStep: m.cadenceStep });

    // May have navigated away while in flight; still update state.
    if (session.id !== id) return;

    const balance = r.creditsBalance !== undefined ? r.creditsBalance : null;
    dispatch(id, { type: "server_charged", balance });

    // If no balance header, refresh the credits badge in the background.
    if (balance === null && PAYWALL_ENABLED) {
      void refreshCredits().catch(() => undefined);
    }

    // Persist the new recording to the library.
    const usedVoice = resolveVoice(r.voiceId);
    const updated: Manifestation = {
      ...m,
      voiceId: usedVoice.id,
      voiceName: usedVoice.name,
      hasAudio: true,
      updatedAt: Date.now(),
      ...(m.speedStep !== undefined ? { speedStep: m.speedStep } : {}),
      ...(m.cadenceStep !== undefined ? { cadenceStep: m.cadenceStep } : {}),
    };
    await library.save(updated, { bytes: new Uint8Array(r.audio), mime: r.mime });

    if (session.id !== id) return;
    dispatch(id, { type: "server_done" });

    // Autoplay through the app-level controller.
    void nowPlaying.play({
      id,
      title: m.title || "Neville",
      route: `/player/${id}`,
      empty: "",
      prepare: async () => {
        const src = await library.audioUri(id);
        if (!src) return null;
        return {
          clips: [src],
          loop: false,
          at: (_i: number) => ({ title: m.title || "Neville", position: 1, total: 1 }),
        };
      },
    });
  } catch (e) {
    if (session.id !== id) return;

    const pe = detectPaywallError(e, PAYWALL_ENABLED);
    if (pe?.type === "no_credits") {
      dispatch(id, { type: "server_402" });
      return;
    }

    const reason =
      e instanceof ApiError && e.message
        ? e.message
        : "The recording could not be made just now.";
    const creditReturned = e instanceof ApiError && e.data?.creditReturned === true;
    dispatch(id, { type: "server_failed", reason, creditReturned });
  }
}

export function useRerecordState(id: string): RerecordState {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    () => (session.id === id ? session.state : INITIAL_STATE),
    () => (session.id === id ? session.state : INITIAL_STATE),
  );
}
