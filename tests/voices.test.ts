import { describe, expect, it } from "vitest";
import config from "@/config/voices.json";
import { DEFAULT_VOICE_ID, ENABLED_VOICES, resolveVoice } from "@/lib/voices";

const CHEAP = ["heygen/heygen-voice-1-turbo", "google/gemini-3.8-flash-lite-tts", "hexgrad/kokoro-82m", "fish-audio/s2.1-pro-free:free", "canopylabs/orpheus-3b-0.1-ft"];

describe("voice choice", () => {
  it("returns the chosen voice when it may be recorded", () => {
    expect(resolveVoice("gemini-sulafat").id).toBe("gemini-sulafat");
  });
  it("falls back to the default for unknown, disabled and sample-only ids", () => {
    for (const id of ["nope", "", null, undefined, "eleven-george", "grok-eve"]) {
      expect(resolveVoice(id).id).toBe(DEFAULT_VOICE_ID);
    }
  });
  it("only ever resolves to a voice that may be recorded", () => {
    for (const v of config.voices) expect(resolveVoice(v.id).generate).toBe(true);
  });
});

describe("config/voices.json", () => {
  it("lets only the cheap models be recorded", () => {
    for (const v of ENABLED_VOICES.filter((x) => x.generate)) expect(CHEAP).toContain(v.model);
  });
  it("keeps ElevenLabs off", () => {
    expect(ENABLED_VOICES.some((v) => v.model.startsWith("elevenlabs/"))).toBe(false);
  });
});

describe("voice descriptions", () => {
  it("gives every recordable voice a short description for the create-page picker", () => {
    for (const v of ENABLED_VOICES.filter((x) => x.generate)) {
      expect(v.desc, v.id).toBeTruthy();
      expect(v.desc!.length, v.id).toBeLessThan(50);
    }
  });
});

describe("atomic flag (#76)", () => {
  it("flags only Gemini voices as atomic", () => {
    for (const v of ENABLED_VOICES) if (v.atomic) expect(v.model).toMatch(/^google\/gemini/);
  });
  it("default is orpheus-tara", () => {
    expect(DEFAULT_VOICE_ID).toBe("orpheus-tara");
  });
});
