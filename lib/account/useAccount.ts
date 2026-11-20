"use client";

import { useEffect, useState } from "react";

export type AccountState = {
  /** Accounts are switched on for this deployment. */
  enabled: boolean;
  user: { id: string; name: string; email: string; image: string | null } | null;
  /** Off production only: the variable names still missing. */
  missing?: string[];
  /** Sign-in buttons this deployment offers. */
  providers?: ("google" | "apple")[];
};

const OFF: AccountState = { enabled: false, user: null };
let cached: Promise<AccountState> | null = null;

/** Asks the server once per page load; any failure means "device only". */
export function fetchAccount(fresh = false): Promise<AccountState> {
  if (!cached || fresh) {
    cached = fetch("/api/account", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<AccountState>) : OFF))
      .catch(() => OFF);
  }
  return cached;
}

export function useAccount(): { account: AccountState; ready: boolean } {
  const [account, setAccount] = useState<AccountState>(OFF);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void fetchAccount().then((a) => {
      if (!live) return;
      setAccount(a);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);
  return { account, ready };
}
