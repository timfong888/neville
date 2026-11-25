import { describe, expect, it } from "vitest";
import { DEFAULT_PACE_ID, DEFAULT_TONE_ID } from "@/lib/delivery";
import { DEFAULT_VOICE_ID, ENABLED_VOICES } from "@/lib/voices";
import type { KV } from "@/native/src/seams/kv.types";
import { SETTINGS_KEYS, makeSettingsStore } from "@/native/src/seams/settingsCore";

function memory(seed: Record<string, string> = {}, refuse = false): KV & { data: Record<string, string> } {
  const data = { ...seed };
  return {
    data,
    get: async (k) => data[k] ?? null,
    set: async (k, v) => (refuse ? false : ((data[k] = v), true)),
  };
}

describe("native settings store", () => {
  it("gives the website's defaults when nothing is stored", async () => {
    expect(await makeSettingsStore(memory()).read()).toEqual({ voiceId: DEFAULT_VOICE_ID, pace: DEFAULT_PACE_ID, tone: DEFAULT_TONE_ID });
  });

  it("uses the website's storage keys", () => {
    expect(SETTINGS_KEYS).toEqual({ voiceId: "nv_voice", pace: "nv_pace", tone: "nv_tone" });
  });

  it("reads back what was written and tells subscribers", async () => {
    const kv = memory();
    const store = makeSettingsStore(kv);
    let calls = 0;
    const off = store.subscribe(() => calls++);
    const voice = ENABLED_VOICES.find((v) => v.generate && v.id !== DEFAULT_VOICE_ID)!;
    expect(await store.write({ voiceId: voice.id, pace: "very-slow", tone: "sleep" })).toBe(true);
    expect(await store.read()).toEqual({ voiceId: voice.id, pace: "very-slow", tone: "sleep" });
    expect(kv.data).toEqual({ nv_voice: voice.id, nv_pace: "very-slow", nv_tone: "sleep" });
    off();
    await store.write({ pace: "slow" });
    expect(calls).toBe(1);
  });

  it("falls back to the default for unknown, disabled or sample-only ids", async () => {
    const sampleOnly = ENABLED_VOICES.find((v) => !v.generate);
    const store = makeSettingsStore(memory({ nv_voice: sampleOnly?.id ?? "gone", nv_pace: "warp", nv_tone: "angry" }));
    expect(await store.read()).toEqual({ voiceId: DEFAULT_VOICE_ID, pace: DEFAULT_PACE_ID, tone: DEFAULT_TONE_ID });
  });

  it("reports a device that refuses storage", async () => {
    expect(await makeSettingsStore(memory({}, true)).write({ tone: "soft" })).toBe(false);
  });
});
