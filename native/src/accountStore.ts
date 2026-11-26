// Who is signed in, shared by every screen (#164). The Account tab writes it; Create reads it.
// The rules are in lib/accountView.ts.
import { useSyncExternalStore } from "react";
import type { AccountState } from "@/lib/api/client";
import { type AccountView, createAccountView } from "@/lib/accountView";
import { api } from "./api";

const store = createAccountView(() => api.account());

export const refreshAccount = (): Promise<AccountState> => store.refresh();
export const clearUser = (): void => store.clearUser();
/** What is known now, for code outside a component. */
export const currentView = (): AccountView => store.get();

export const useAccountView = (): AccountView => useSyncExternalStore(store.subscribe, store.get, store.get);
/** The latest known account, or null while unknown. */
export const useAccount = (): AccountState | null => useAccountView().account;
