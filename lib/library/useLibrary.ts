"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAccount } from "@/lib/account/useAccount";
import { AccountStore } from "@/lib/library/accountStore";
import { EMPTY_LIBRARY, type Library } from "@/lib/library/model";
import { CHANGED, DeviceStore, type LibraryStore } from "@/lib/library/store";

const device = new DeviceStore();
let account: AccountStore | null = null;

/** The device store, whatever the sign-in state. Used to move device work into an account. */
export function getDeviceStore(): DeviceStore {
  return device;
}

/** The store this browser uses: the account when signed in, else the device. */
export async function resolveStore(): Promise<LibraryStore> {
  const a = await fetchAccount();
  if (a.enabled && a.user) return (account ??= new AccountStore());
  return device;
}

/** The saved library, kept current as it changes in this tab or another. */
export function useLibrary(): { lib: Library; ready: boolean; store: LibraryStore; reload: () => void; error: string } {
  const [lib, setLib] = useState<Library>(EMPTY_LIBRARY);
  const [ready, setReady] = useState(false);
  const [store, setStore] = useState<LibraryStore>(device);
  const [error, setError] = useState("");
  const reload = useCallback(() => {
    void resolveStore().then(async (s) => {
      setStore(s);
      try {
        setLib(await s.load());
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load your library.");
      }
      setReady(true);
    });
  }, []);
  useEffect(() => {
    reload();
    const onStorage = (e: StorageEvent) => e.key?.startsWith("nv_library") && reload();
    window.addEventListener(CHANGED, reload);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGED, reload);
      window.removeEventListener("storage", onStorage);
    };
  }, [reload]);
  return { lib, ready, store, reload, error };
}
