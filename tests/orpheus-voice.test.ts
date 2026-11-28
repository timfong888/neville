// Regression tests for Orpheus as the default voice for all accounts.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_VOICE_ID,
  ENABLED_VOICES,
  resolveVoice,
} from "@/lib/voices";

describe("config", () => {
  it("default is orpheus-tara for all accounts", () => {
    expect(DEFAULT_VOICE_ID).toBe("orpheus-tara");
  });

  it("orpheus-tara is enabled and generate=true", () => {
    const v = ENABLED_VOICES.find((vv) => vv.id === "orpheus-tara");
    expect(v).toBeDefined();
    expect(v!.generate).toBe(true);
    expect(v!.enabled).toBe(true);
  });

  it("all 8 orpheus voices are enabled and generate=true", () => {
    const orpheus = ENABLED_VOICES.filter((v) => v.model === "canopylabs/orpheus-3b-0.1-ft");
    expect(orpheus).toHaveLength(8);
    for (const v of orpheus) {
      expect(v.generate).toBe(true);
      expect(v.enabled).toBe(true);
    }
  });

  it("no voices are adultOnly (Orpheus is visible to all)", () => {
    for (const v of ENABLED_VOICES) {
      expect((v as { adultOnly?: boolean }).adultOnly).toBeFalsy();
    }
  });
});

describe("resolveVoice with Orpheus default", () => {
  it("null id gives orpheus-tara", () => {
    expect(resolveVoice(null).id).toBe("orpheus-tara");
  });

  it("unknown id gives orpheus-tara", () => {
    expect(resolveVoice("unknown-id").id).toBe("orpheus-tara");
  });

  it("explicit orpheus-tara id returns orpheus-tara", () => {
    expect(resolveVoice("orpheus-tara").id).toBe("orpheus-tara");
  });

  it("explicit orpheus-leah id returns orpheus-leah", () => {
    expect(resolveVoice("orpheus-leah").id).toBe("orpheus-leah");
  });

  it("standard voice still works (gemini-sulafat)", () => {
    expect(resolveVoice("gemini-sulafat").id).toBe("gemini-sulafat");
  });

  it("resolves every voice id to a generatable voice", () => {
    for (const v of ENABLED_VOICES) {
      expect(resolveVoice(v.id).generate).toBe(true);
    }
  });
});
