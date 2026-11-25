import { useCallback, useEffect, useState } from "react";
import { EMPTY_LIBRARY, type Library } from "@/lib/library/model";
import { library } from "./library";

/** The saved library, kept current as it changes. `ready` is false until the first read. */
export function useLibrary(): { lib: Library; ready: boolean; error: string; reload: () => void } {
  const [lib, setLib] = useState<Library>(EMPTY_LIBRARY);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const reload = useCallback(() => {
    library
      .load()
      .then((l) => (setLib(l), setError("")))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load your library."))
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    reload();
    return library.subscribe(reload);
  }, [reload]);
  return { lib, ready, error, reload };
}
