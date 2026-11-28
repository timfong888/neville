// Framework-free voice-list helpers. Injected api/kv make this testable without React.
import type { ServerVoice, VoicesResponse } from "@/lib/api/client";
import type { KV } from "./kv.types";

export type { ServerVoice, VoicesResponse };
export { FALLBACK_VOICE_ID } from "./voiceConstants";

export const CACHE_KEY = "nv_server_voices";

/** Load the last cached list from device storage. null when nothing is stored. */
export async function readCache(kvStore: KV): Promise<VoicesResponse | null> {
  try {
    const raw = await kvStore.get(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VoicesResponse;
  } catch {
    return null;
  }
}

/** Fetch a fresh list from the server and cache it. null when the server is unreachable. */
export async function fetchFresh(
  apiClient: { voices(): Promise<VoicesResponse> },
  kvStore: KV,
): Promise<VoicesResponse | null> {
  try {
    const data = await apiClient.voices();
    if (Array.isArray(data?.voices) && data.voices.length > 0) {
      await kvStore.set(CACHE_KEY, JSON.stringify(data));
      return data;
    }
  } catch {}
  return null;
}

/**
 * Resolve a stored voice id against the server list.
 * Returns the id when it names a recordable voice in the list.
 * Returns null otherwise, so the caller omits the id and the server picks its default.
 */
export function resolveVoiceId(id: string | null | undefined, voices: ServerVoice[]): string | null {
  if (!id) return null;
  return voices.find((v) => v.id === id && v.generate) ? id : null;
}

/** Voice name from the server list, falling back to the id string when not found. */
export function voiceName(id: string, voices: ServerVoice[]): string {
  return voices.find((v) => v.id === id)?.name ?? id;
}
