// Who is signed in, shared by every screen (#164). The Account tab writes it; Create reads it.
import { useSyncExternalStore } from "react";
import type { AccountState } from "@/lib/api/client";
import { api } from "./api";

let account: AccountState | null = null;
const subs = new Set<() => void>();
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));
const snapshot = () => account;

/** Records the latest answer from the server and tells every screen that shows it. */
export function setAccount(next: AccountState | null): void {
  account = next;
  subs.forEach((f) => f());
}

/** Asks the server who is signed in. A failed ask keeps what was known. Rejects so the caller can say why. */
export async function refreshAccount(): Promise<AccountState> {
  const next = await api.account();
  setAccount(next);
  return next;
}

/** The latest known account, for code outside a component. */
export const currentAccount = (): AccountState | null => account;

export const useAccount = (): AccountState | null => useSyncExternalStore(subscribe, snapshot, snapshot);
