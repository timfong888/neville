// The user's first name: one source for every screen.
// Signed in → reads and writes the account API; keeps device copy in sync.
// Signed out → device kv only.
import { useSyncExternalStore } from "react";
import { NAME_STORAGE_KEY } from "@/lib/firstName";
import { api } from "./api";
import { currentView } from "./accountStore";
import { kv } from "./seams/kv";

type State = { name: string };

let state: State = { name: "" };
const subs = new Set<() => void>();

function setState(next: State): void {
  state = next;
  subs.forEach((f) => f());
}

const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));
const snapshot = (): string => state.name;

export const useFirstName = (): string => useSyncExternalStore(subscribe, snapshot, snapshot);
export const getFirstName = (): string => state.name;

/** Loads from account when signed in, falls back to device kv. */
export async function loadProfileName(): Promise<void> {
  const { account } = currentView();
  const signedIn = !!(account?.enabled && account.user);
  if (signedIn) {
    try {
      const r = await api.profileName();
      const serverName = r.firstName ?? "";
      setState({ name: serverName });
      // Sync to device so it's available offline.
      void kv.set(NAME_STORAGE_KEY, serverName);
      return;
    } catch {
      // Fall through to device.
    }
  }
  const local = await kv.get(NAME_STORAGE_KEY).catch(() => null);
  setState({ name: local ?? "" });
}

/**
 * Saves the name. Skips the write when nothing changed (idempotent).
 * Writes to device kv and to the account API when signed in.
 */
export async function saveProfileName(name: string): Promise<void> {
  if (name === state.name) return;
  setState({ name });
  void kv.set(NAME_STORAGE_KEY, name);
  const { account } = currentView();
  const signedIn = !!(account?.enabled && account.user);
  if (signedIn) {
    await api.saveProfileName(name);
  }
}
