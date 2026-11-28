// React hook for the server-driven voice list. Framework-free helpers live in
// voiceListCore.ts so unit tests can run without React or native modules.
import { useEffect, useState } from "react";
import { api } from "../api";
import { kv } from "./kv";
import { FALLBACK_VOICE_ID, fetchFresh, readCache, type ServerVoice } from "./voiceListCore";

export type { ServerVoice } from "./voiceListCore";
export { FALLBACK_VOICE_ID, fetchFresh, readCache, resolveVoiceId, voiceName } from "./voiceListCore";

type VoiceState = { voices: ServerVoice[]; defaultId: string; ready: boolean };

/**
 * React hook: returns the voice list, the server default id, and whether the list
 * has loaded. On first mount it loads from cache (fast), then refreshes from the server.
 * With no cache and no network: ready=false, voices=[], defaultId=FALLBACK_VOICE_ID.
 */
export function useVoices(): VoiceState {
  const [state, setState] = useState<VoiceState>({ voices: [], defaultId: FALLBACK_VOICE_ID, ready: false });
  useEffect(() => {
    let live = true;
    void (async () => {
      const cached = await readCache(kv);
      if (cached && live) setState({ voices: cached.voices as ServerVoice[], defaultId: cached.default, ready: true });
      const fresh = await fetchFresh(api, kv);
      if (fresh && live) setState({ voices: fresh.voices as ServerVoice[], defaultId: fresh.default, ready: true });
      else if (!cached && live) setState((s) => ({ ...s, ready: false }));
    })();
    return () => { live = false; };
  }, []);
  return state;
}
