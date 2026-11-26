// Who is signed in, shared by every screen (#164). The Account tab writes it; Create reads it.
import { useSyncExternalStore } from "react";
import type { AccountState } from "@/lib/api/client";
import { api } from "./api";

/** `checked` is true once a lookup has finished, answered or failed; until then nothing is known. */
type View = { account: AccountState | null; checked: boolean };
let view: View = { account: null, checked: false };
const subs = new Set<() => void>();
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));
const snapshot = () => view;
const put = (next: View) => {
  view = next;
  subs.forEach((f) => f());
};

/** Records the latest answer from the server and tells every screen that shows it. */
export function setAccount(next: AccountState | null): void {
  put({ account: next, checked: true });
}

/** Asks the server who is signed in. A failed ask keeps what was known, marks the lookup finished, and rejects so the caller can say why. */
export async function refreshAccount(): Promise<AccountState> {
  try {
    const next = await api.account();
    setAccount(next);
    return next;
  } catch (e) {
    put({ ...view, checked: true });
    throw e;
  }
}

/** What is known now, for code outside a component. */
export const currentView = (): View => view;

export const useAccountView = (): View => useSyncExternalStore(subscribe, snapshot, snapshot);
/** The latest known account, or null while unknown or signed out. */
export const useAccount = (): AccountState | null => useAccountView().account;
