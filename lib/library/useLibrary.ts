"use client";

import { useCallback, useEffect, useState } from "react";
import { EMPTY_LIBRARY, type Library } from "@/lib/library/model";
import { CHANGED, DeviceStore, type LibraryStore } from "@/lib/library/store";

let store: LibraryStore | null = null;

/** The store this browser uses. Accounts (#13) swap in the server store here. */
export function getStore(): LibraryStore {
  if (!store) store = new DeviceStore();
  return store;
}

/** The saved library, kept current as it changes in this tab or another. */
export function useLibrary(): { lib: Library; ready: boolean; store: LibraryStore; reload: () => void } {
  const [lib, setLib] = useState<Library>(EMPTY_LIBRARY);
  const [ready, setReady] = useState(false);
  const s = getStore();
  const reload = useCallback(() => {
    void s.load().then((l) => {
      setLib(l);
      setReady(true);
    });
  }, [s]);
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
  return { lib, ready, store: s, reload };
}
