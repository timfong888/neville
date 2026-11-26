// Credits balance, shared across screens. Pattern follows accountStore.ts.
import { useSyncExternalStore } from "react";
import type { CreditsResponse } from "@/lib/api/client";
import { api } from "./api";

type CreditsState = { credits: CreditsResponse | null };

let state: CreditsState = { credits: null };
const subs = new Set<() => void>();

function setState(next: CreditsState): void {
  state = next;
  subs.forEach((f) => f());
}

const subscribe = (f: () => void): (() => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};

const snapshot = (): CreditsResponse | null => state.credits;

export const useCredits = (): CreditsResponse | null =>
  useSyncExternalStore(subscribe, snapshot, snapshot);

/** Fetches latest credits from the server; silently keeps old value on error. */
export async function refreshCredits(): Promise<void> {
  try {
    const credits = await api.credits();
    setState({ credits });
  } catch {
    // Keep old value on error.
  }
}
