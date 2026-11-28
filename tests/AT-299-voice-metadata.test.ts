// Acceptance tests for issue #299: voice metadata (gender, pitch, language),
// display-name-only rows, and profile language filter.
import { describe, expect, it } from "vitest";
import { ENABLED_VOICES, DEFAULT_VOICE_ID } from "@/lib/voices";
import { voiceRowNote, filterVoicesByLanguage, resolveVoiceForLanguage } from "@/lib/voiceDisplay";
import type { VoiceForDisplay } from "@/lib/voiceDisplay";

// Known provider/model strings that must never appear in production rows.
const MODEL_STRINGS = [
  "orpheus", "Orpheus", "heygen", "HeyGen", "gemini", "Gemini",
  "google", "Google", "canopylabs", "sesame", "Sesame",
  "fish-audio", "hexgrad", "elevenlabs", "ElevenLabs",
  "mistralai", "voxtral", "Voxtral", "x-ai", "grok", "Grok",
];

// AT-1 -----------------------------------------------------------------------
describe("AT-1: full voice catalogue — no model or provider string in production rows", () => {
  it("voiceRowNote(v, false) never contains a model or provider string for any enabled voice", () => {
    for (const v of ENABLED_VOICES) {
      const note = voiceRowNote(v, false);
      for (const s of MODEL_STRINGS) {
        expect(note, `voice ${v.id} row contains "${s}"`).not.toContain(s);
      }
    }
  });

  it("note does not contain the provider field value for any voice", () => {
    for (const v of ENABLED_VOICES) {
      const note = voiceRowNote(v, false);
      if (v.provider) {
        expect(note, `voice ${v.id} row leaks provider "${v.provider}"`).not.toContain(v.provider);
      }
    }
  });

  it("note does not contain the model field value for any voice", () => {
    for (const v of ENABLED_VOICES) {
      const note = voiceRowNote(v, false);
      if (v.model) {
        // e.g. "canopylabs/orpheus-3b-0.1-ft" or "heygen/heygen-voice-1-turbo"
        const modelParts = v.model.split("/");
        for (const part of modelParts) {
          expect(note, `voice ${v.id} row leaks model part "${part}"`).not.toContain(part);
        }
      }
    }
  });
});

// AT-2 -----------------------------------------------------------------------
describe("AT-2: each row shows name, gender and pitch (where present)", () => {
  it("a voice with gender=female has 'Female' in its row note", () => {
    const v: VoiceForDisplay = { id: "x", name: "X", provider: "P", model: "m", generate: true, gender: "female", pitch: "Medium", language: "en" };
    expect(voiceRowNote(v)).toContain("Female");
  });

  it("a voice with gender=male has 'Male' in its row note", () => {
    const v: VoiceForDisplay = { id: "x", name: "X", provider: "P", model: "m", generate: true, gender: "male", pitch: "Low", language: "en" };
    expect(voiceRowNote(v)).toContain("Male");
  });

  it("pitch Low/Medium/High appears verbatim in the row note", () => {
    for (const pitch of ["Low", "Medium", "High"] as const) {
      const v: VoiceForDisplay = { id: "x", name: "X", provider: "P", model: "m", generate: true, pitch };
      expect(voiceRowNote(v)).toContain(pitch);
    }
  });

  it("omitted fields produce no empty placeholders", () => {
    const v: VoiceForDisplay = { id: "x", name: "X", provider: "P", model: "m", generate: true };
    const note = voiceRowNote(v);
    expect(note).not.toContain("undefined");
    expect(note).not.toContain("null");
    expect(note).not.toMatch(/· ·/); // no consecutive separators
  });

  it("every enabled voice with gender has it in its note", () => {
    for (const v of ENABLED_VOICES) {
      if (!v.gender) continue;
      const note = voiceRowNote(v);
      const expected = v.gender === "female" ? "Female" : "Male";
      expect(note, `voice ${v.id} should show gender`).toContain(expected);
    }
  });
});

// AT-3 -----------------------------------------------------------------------
describe("AT-3: profile language filters the voice list; stale voice falls back with notice", () => {
  const enVoice = (id: string): VoiceForDisplay =>
    ({ id, name: id, provider: "P", model: "m", generate: true, language: "en" });
  const esVoice = (id: string): VoiceForDisplay =>
    ({ id, name: id, provider: "P", model: "m", generate: true, language: "es" });
  const noLangVoice = (id: string): VoiceForDisplay =>
    ({ id, name: id, provider: "P", model: "m", generate: true });

  const voices = [enVoice("en-1"), enVoice("en-2"), esVoice("es-1"), noLangVoice("any-1")];

  it("filterVoicesByLanguage('en') keeps en voices and language-agnostic voices", () => {
    const result = filterVoicesByLanguage(voices, "en");
    expect(result.map((v) => v.id)).toEqual(["en-1", "en-2", "any-1"]);
  });

  it("filterVoicesByLanguage('es') keeps es voices and language-agnostic voices", () => {
    const result = filterVoicesByLanguage(voices, "es");
    expect(result.map((v) => v.id)).toEqual(["es-1", "any-1"]);
  });

  it("filterVoicesByLanguage('fr') keeps only language-agnostic voices (no fr voices defined)", () => {
    const result = filterVoicesByLanguage(voices, "fr");
    expect(result.map((v) => v.id)).toEqual(["any-1"]);
  });

  it("resolveVoiceForLanguage keeps current voice when it matches", () => {
    const { id, notice } = resolveVoiceForLanguage("en-1", voices, "en", "en-2");
    expect(id).toBe("en-1");
    expect(notice).toBeNull();
  });

  it("resolveVoiceForLanguage falls back and returns a notice when current voice is unavailable", () => {
    const { id, notice } = resolveVoiceForLanguage("es-1", voices, "en", "en-1");
    expect(id).toBe("en-1");
    expect(notice).toBeTruthy();
    expect(notice).toMatch(/en-1|en/i);
  });

  it("fallback picks the first generate=true voice in the filtered list when default is absent", () => {
    const { id } = resolveVoiceForLanguage("es-1", voices, "en", "missing-default");
    // "missing-default" is not in filtered list, so picks first generate=true: en-1
    expect(id).toBe("en-1");
  });
});

// AT-4 -----------------------------------------------------------------------
describe("AT-4: EAS profiles — production hides model names; testing profile shows them", () => {
  it("production EAS profile does not set EXPO_PUBLIC_SHOW_VOICE_MODEL=1", async () => {
    const { readFileSync } = await import("node:fs");
    const eas = JSON.parse(readFileSync("native/eas.json", "utf8")) as {
      build: { production: { env?: Record<string, string> }; testing?: { env?: Record<string, string> } };
    };
    expect(eas.build.production.env?.EXPO_PUBLIC_SHOW_VOICE_MODEL).not.toBe("1");
  });

  it("a testing profile exists and sets EXPO_PUBLIC_SHOW_VOICE_MODEL=1", async () => {
    const { readFileSync } = await import("node:fs");
    const eas = JSON.parse(readFileSync("native/eas.json", "utf8")) as {
      build: { production?: object; testing?: { env?: Record<string, string> } };
    };
    expect(eas.build.testing?.env?.EXPO_PUBLIC_SHOW_VOICE_MODEL).toBe("1");
  });

  it("voiceRowNote(v, true) includes the provider string", () => {
    const v: VoiceForDisplay = { id: "x", name: "X", provider: "HeyGen Voice Turbo", model: "heygen/heygen-voice-1-turbo", generate: true, gender: "female" };
    expect(voiceRowNote(v, true)).toContain("HeyGen Voice Turbo");
  });

  it("voiceRowNote(v, false) does not include the provider string", () => {
    const v: VoiceForDisplay = { id: "x", name: "X", provider: "HeyGen Voice Turbo", model: "heygen/heygen-voice-1-turbo", generate: true, gender: "female" };
    expect(voiceRowNote(v, false)).not.toContain("HeyGen Voice Turbo");
  });
});

// AT-5 -----------------------------------------------------------------------
describe("AT-5: voice missing language still renders without error", () => {
  it("voiceRowNote does not throw when language is absent", () => {
    const v: VoiceForDisplay = { id: "x", name: "X", provider: "P", model: "m", generate: true, gender: "female", pitch: "Medium" };
    expect(() => voiceRowNote(v)).not.toThrow();
    expect(voiceRowNote(v)).toBe("Female · Medium");
  });

  it("filterVoicesByLanguage returns voices-without-language for any language", () => {
    const v: VoiceForDisplay = { id: "x", name: "X", provider: "P", model: "m", generate: true };
    expect(filterVoicesByLanguage([v], "en")).toHaveLength(1);
    expect(filterVoicesByLanguage([v], "ja")).toHaveLength(1);
  });

  it("every enabled voice renders without error regardless of missing metadata", () => {
    for (const v of ENABLED_VOICES) {
      expect(() => voiceRowNote(v)).not.toThrow();
    }
  });

  it("DEFAULT_VOICE_ID is a generate-enabled voice in ENABLED_VOICES", () => {
    const def = ENABLED_VOICES.find((v) => v.id === DEFAULT_VOICE_ID);
    expect(def).toBeDefined();
    expect(def?.generate).toBe(true);
  });
});
