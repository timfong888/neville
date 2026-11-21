import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMode } from "@/lib/modeStore";
import { readMixOn, writeMixOn } from "@/lib/voiceMixStore";
import { readVoiceChoice, writeVoiceChoice } from "@/lib/voiceStore";

// A minimal browser: localStorage and events, enough for the stores.
beforeEach(() => {
  const m = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    },
    dispatchEvent: () => true,
  };
});
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("applyMode and the voice", () => {
  it("Active records in Charon with Mix off, and leaving it restores the listener's voice and Mix", () => {
    writeVoiceChoice("gemini-sulafat");
    writeMixOn(true);
    applyMode("active");
    expect(readVoiceChoice()).toBe("gemini-charon");
    expect(readMixOn()).toBe(false);
    applyMode("active"); // applying it twice must not save Charon as "the listener's voice"
    applyMode("calm");
    expect(readVoiceChoice()).toBe("gemini-sulafat");
    expect(readMixOn()).toBe(true);
  });
  it("keeps a voice or Mix setting the listener picked while in Active", () => {
    writeVoiceChoice("gemini-sulafat");
    writeMixOn(true);
    applyMode("active");
    writeVoiceChoice("gemini-kore");
    applyMode("sleep");
    expect(readVoiceChoice()).toBe("gemini-kore");
    expect(readMixOn()).toBe(true);
  });
  it("goes back to no saved voice when there was none, and leaves other modes' voice alone", () => {
    applyMode("active");
    applyMode("calm");
    expect(readVoiceChoice()).toBeNull();
    writeVoiceChoice("gemini-kore");
    applyMode("sleep");
    expect(readVoiceChoice()).toBe("gemini-kore");
  });
});
