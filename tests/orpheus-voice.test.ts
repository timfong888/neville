// Regression tests for Orpheus voice: adult-tier default, visibility, and server-side guard.
import { describe, expect, it } from "vitest";
import {
  ADULT_DEFAULT_VOICE_ID,
  DEFAULT_VOICE_ID,
  ENABLED_VOICES,
  resolveVoiceForUser,
  visibleVoices,
} from "@/lib/voices";

describe("config", () => {
  it("adultDefault is orpheus-tara", () => {
    expect(ADULT_DEFAULT_VOICE_ID).toBe("orpheus-tara");
  });

  it("standard default is unchanged (gemini-sulafat)", () => {
    expect(DEFAULT_VOICE_ID).toBe("gemini-sulafat");
  });

  it("orpheus-tara is enabled and generate=true", () => {
    const v = ENABLED_VOICES.find((vv) => vv.id === "orpheus-tara");
    expect(v).toBeDefined();
    expect(v!.generate).toBe(true);
    expect(v!.enabled).toBe(true);
  });

  it("all 8 orpheus voices are adultOnly", () => {
    const orpheus = ENABLED_VOICES.filter((v) => v.model === "canopylabs/orpheus-3b-0.1-ft");
    expect(orpheus).toHaveLength(8);
    for (const v of orpheus) {
      expect(v.adultOnly).toBe(true);
    }
  });

  it("non-orpheus voices are not adultOnly", () => {
    const nonOrpheus = ENABLED_VOICES.filter((v) => v.model !== "canopylabs/orpheus-3b-0.1-ft");
    for (const v of nonOrpheus) {
      expect(v.adultOnly).toBeFalsy();
    }
  });
});

describe("resolveVoiceForUser", () => {
  it("adult user with null id gets orpheus-tara (adult default)", () => {
    const v = resolveVoiceForUser(null, true);
    expect(v.id).toBe("orpheus-tara");
  });

  it("adult user with unknown id gets orpheus-tara (adult default)", () => {
    const v = resolveVoiceForUser("unknown-id", true);
    expect(v.id).toBe("orpheus-tara");
  });

  it("non-adult user with null id gets gemini-sulafat (standard default)", () => {
    const v = resolveVoiceForUser(null, false);
    expect(v.id).toBe("gemini-sulafat");
  });

  it("non-adult user with unknown id gets gemini-sulafat (standard default)", () => {
    const v = resolveVoiceForUser("unknown-id", false);
    expect(v.id).toBe("gemini-sulafat");
  });

  it("adult user requesting an adultOnly voice gets that voice", () => {
    const v = resolveVoiceForUser("orpheus-leah", true);
    expect(v.id).toBe("orpheus-leah");
  });

  it("non-adult user requesting an adultOnly voice is blocked (gets standard default)", () => {
    const v = resolveVoiceForUser("orpheus-tara", false);
    expect(v.id).toBe("gemini-sulafat");
  });

  it("non-adult user requesting a standard voice gets that voice", () => {
    const v = resolveVoiceForUser("gemini-sulafat", false);
    expect(v.id).toBe("gemini-sulafat");
  });

  it("adult user requesting a standard voice gets that voice", () => {
    const v = resolveVoiceForUser("heygen-nadine", true);
    expect(v.id).toBe("heygen-nadine");
  });
});

describe("visibleVoices", () => {
  it("non-adult cannot see any adultOnly voices", () => {
    const list = visibleVoices(false);
    expect(list.some((v) => v.adultOnly)).toBe(false);
  });

  it("adult can see adultOnly voices", () => {
    const list = visibleVoices(true);
    expect(list.some((v) => v.adultOnly)).toBe(true);
  });

  it("adult list includes orpheus-tara", () => {
    expect(visibleVoices(true).some((v) => v.id === "orpheus-tara")).toBe(true);
  });

  it("non-adult list does not include orpheus-tara", () => {
    expect(visibleVoices(false).some((v) => v.id === "orpheus-tara")).toBe(false);
  });

  it("non-adult list still includes standard voices", () => {
    const list = visibleVoices(false);
    expect(list.some((v) => v.id === "gemini-sulafat")).toBe(true);
  });
});
