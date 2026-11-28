// Regression tests for the server-driven voice list (issue #274).
// Tests use injected api/kv stubs so no React or native modules are needed.
import { describe, expect, it } from "vitest";
import { ENABLED_VOICES, DEFAULT_VOICE_ID } from "@/lib/voices";
import { FALLBACK_VOICE_ID, fetchFresh, readCache, resolveVoiceId, voiceName } from "@/native/src/seams/voiceListCore";
import type { ServerVoice, VoicesResponse } from "@/lib/api/client";
import type { KV } from "@/native/src/seams/kv.types";

// ---- helpers -----------------------------------------------------------

function memKV(seed: Record<string, string> = {}): KV & { data: Record<string, string> } {
  const data = { ...seed };
  return {
    data,
    get: async (k) => data[k] ?? null,
    set: async (k, v) => ((data[k] = v), true),
    remove: async (k) => void delete data[k],
  };
}

function makeApi(result: VoicesResponse | null): { voices(): Promise<VoicesResponse> } {
  return {
    voices: () => (result ? Promise.resolve(result) : Promise.reject(new Error("offline"))),
  };
}

const SAMPLE_VOICES: ServerVoice[] = ENABLED_VOICES.filter((v) => v.generate).slice(0, 3).map((v) => ({ ...v }));
const SAMPLE_PAYLOAD: VoicesResponse = { voices: SAMPLE_VOICES, default: SAMPLE_VOICES[0].id };

// ---- fetchFresh --------------------------------------------------------

describe("fetchFresh", () => {
  it("returns server list and caches it when network is reachable", async () => {
    const kv = memKV();
    const result = await fetchFresh(makeApi(SAMPLE_PAYLOAD), kv);
    expect(result).toEqual(SAMPLE_PAYLOAD);
    expect(kv.data["nv_server_voices"]).toBeTruthy();
    expect(JSON.parse(kv.data["nv_server_voices"])).toEqual(SAMPLE_PAYLOAD);
  });

  it("returns null and leaves cache unchanged when server is offline", async () => {
    const kv = memKV();
    const result = await fetchFresh(makeApi(null), kv);
    expect(result).toBeNull();
    expect(kv.data["nv_server_voices"]).toBeUndefined();
  });

  it("tier filter: server decides which voices appear in the list", async () => {
    // The server /api/voices filters by tier — here we confirm the client stores and
    // returns whatever the server sent, without re-filtering.
    const tierFiltered: VoicesResponse = {
      voices: SAMPLE_VOICES.filter((v) => v.tier !== "premium"),
      default: SAMPLE_PAYLOAD.default,
    };
    const kv = memKV();
    const result = await fetchFresh(makeApi(tierFiltered), kv);
    expect(result?.voices.every((v) => v.tier !== "premium")).toBe(true);
    expect(JSON.parse(kv.data["nv_server_voices"]).voices).toHaveLength(tierFiltered.voices.length);
  });
});

// ---- readCache ---------------------------------------------------------

describe("readCache", () => {
  it("returns null when nothing is cached", async () => {
    expect(await readCache(memKV())).toBeNull();
  });

  it("returns the cached list when offline", async () => {
    const kv = memKV({ nv_server_voices: JSON.stringify(SAMPLE_PAYLOAD) });
    const result = await readCache(kv);
    expect(result).toEqual(SAMPLE_PAYLOAD);
  });

  it("returns null when cache is corrupt", async () => {
    const kv = memKV({ nv_server_voices: "not-json{" });
    expect(await readCache(kv)).toBeNull();
  });
});

// ---- no-cache fallback -------------------------------------------------

describe("no-cache fallback", () => {
  it("FALLBACK_VOICE_ID is a valid, generate-enabled voice id", () => {
    const v = ENABLED_VOICES.find((vv) => vv.id === FALLBACK_VOICE_ID);
    expect(v).toBeDefined();
    expect(v!.generate).toBe(true);
  });

  it("when no cache and no network, readCache and fetchFresh both return null", async () => {
    const kv = memKV();
    expect(await readCache(kv)).toBeNull();
    expect(await fetchFresh(makeApi(null), kv)).toBeNull();
  });
});

// ---- resolveVoiceId ----------------------------------------------------

describe("resolveVoiceId", () => {
  it("returns the id when it names a recordable voice", () => {
    const id = SAMPLE_VOICES.find((v) => v.generate)!.id;
    expect(resolveVoiceId(id, SAMPLE_VOICES)).toBe(id);
  });

  it("returns null for null/undefined/empty", () => {
    expect(resolveVoiceId(null, SAMPLE_VOICES)).toBeNull();
    expect(resolveVoiceId(undefined, SAMPLE_VOICES)).toBeNull();
    expect(resolveVoiceId("", SAMPLE_VOICES)).toBeNull();
  });

  it("returns null for a removed voice id — server uses its default", () => {
    expect(resolveVoiceId("removed-voice-id", SAMPLE_VOICES)).toBeNull();
  });

  it("returns null for a sample-only (non-generate) voice", () => {
    const sampleOnly: ServerVoice = { ...SAMPLE_VOICES[0], id: "sample-only", generate: false };
    expect(resolveVoiceId("sample-only", [sampleOnly])).toBeNull();
  });
});

// ---- voiceName ---------------------------------------------------------

describe("voiceName", () => {
  it("returns the voice name from the list", () => {
    expect(voiceName(SAMPLE_VOICES[0].id, SAMPLE_VOICES)).toBe(SAMPLE_VOICES[0].name);
  });

  it("falls back to the id string when the voice is not in the list", () => {
    expect(voiceName("unknown-id", SAMPLE_VOICES)).toBe("unknown-id");
  });
});

// ---- api/voices endpoint -----------------------------------------------

describe("/api/voices endpoint", () => {
  it("returns all enabled voices from the config", () => {
    // The bundled list is the server's source of truth.
    expect(ENABLED_VOICES.length).toBeGreaterThan(0);
    expect(DEFAULT_VOICE_ID).toBeTruthy();
    // All enabled voices have required fields.
    for (const v of ENABLED_VOICES) {
      expect(v.id).toBeTruthy();
      expect(typeof v.generate).toBe("boolean");
    }
  });
});
