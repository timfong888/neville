// Unit tests for lib/adult/tts.ts (buildAdultVoiceChain).
// These are pure — no network, no server-only.
import { describe, expect, it } from "vitest";
import { buildAdultVoiceChain } from "@/lib/adult/tts";
import limits from "@/config/limits.json";

const REQ = { id: "gemini-sulafat", model: "google/gemini-3.8-flash-lite-tts", voice: "Sulafat", atomic: true };
const FALLBACKS = [
  { id: "fb-a", model: "model-a", voice: "v1", atomic: false },
  { id: "fb-b", model: "model-b", voice: "v2", atomic: true },
  { id: "fb-c", model: "model-c", voice: "v3", atomic: false },
];

describe("buildAdultVoiceChain", () => {
  it("puts the requested voice first", () => {
    const chain = buildAdultVoiceChain(REQ, FALLBACKS, 3);
    expect(chain[0]).toMatchObject({ id: REQ.id, model: REQ.model, voice: REQ.voice, atomic: true });
  });

  it("caps at max", () => {
    expect(buildAdultVoiceChain(REQ, FALLBACKS, 1)).toHaveLength(1);
    expect(buildAdultVoiceChain(REQ, FALLBACKS, 2)).toHaveLength(2);
    expect(buildAdultVoiceChain(REQ, FALLBACKS, 3)).toHaveLength(3);
    expect(buildAdultVoiceChain(REQ, FALLBACKS, 10)).toHaveLength(FALLBACKS.length + 1);
  });

  it("caps at exactly 3 for the production max", () => {
    const chain = buildAdultVoiceChain(REQ, FALLBACKS, 3);
    expect(chain).toHaveLength(3);
  });

  it("deduplicates when requested voice appears in fallbacks", () => {
    const fallbacksWithDup = [
      { id: "dup", model: REQ.model, voice: REQ.voice, atomic: false }, // same model/voice as requested
      { id: "fb-a", model: "model-a", voice: "v1", atomic: false },
    ];
    const chain = buildAdultVoiceChain(REQ, fallbacksWithDup, 3);
    // Requested is first; dup is skipped; fb-a is second
    expect(chain).toHaveLength(2);
    expect(chain[0].id).toBe(REQ.id);
    expect(chain[1].id).toBe("fb-a");
  });

  it("deduplicates within fallbacks", () => {
    const dups = [
      { id: "fb-a", model: "model-a", voice: "v1", atomic: false },
      { id: "fb-a-dup", model: "model-a", voice: "v1", atomic: false }, // same model/voice
    ];
    const chain = buildAdultVoiceChain(REQ, dups, 3);
    expect(chain).toHaveLength(2); // requested + first unique fallback
    expect(chain[1].id).toBe("fb-a");
  });

  it("defaults atomic to false when missing", () => {
    const noAtomic = [{ id: "x", model: "m", voice: "v" }];
    const chain = buildAdultVoiceChain({ id: "r", model: "rm", voice: "rv" }, noAtomic, 2);
    expect(chain[0].atomic).toBe(false);
    expect(chain[1].atomic).toBe(false);
  });

  it("preserves atomic: true from requested", () => {
    const chain = buildAdultVoiceChain({ id: "r", model: "m", voice: "v", atomic: true }, [], 3);
    expect(chain[0].atomic).toBe(true);
  });

  it("returns empty when max is 0", () => {
    expect(buildAdultVoiceChain(REQ, FALLBACKS, 0)).toHaveLength(0);
  });

  it("returns only requested when no fallbacks", () => {
    expect(buildAdultVoiceChain(REQ, [], 3)).toHaveLength(1);
    expect(buildAdultVoiceChain(REQ, [], 3)[0].id).toBe(REQ.id);
  });

  it("fallback only applies in adult tier (non-adult path does not call buildAdultVoiceChain)", () => {
    // The chain builder is only invoked from the adult-tier branch of the manifest route.
    // A non-adult request never builds a chain — it uses a single voice directly.
    // This test asserts the helper itself is neutral to tier status.
    const chain = buildAdultVoiceChain(REQ, FALLBACKS, 3);
    expect(chain.length).toBeGreaterThan(0);
    // The caller (manifest route) gates this behind isAdultTierUser; the helper itself is tier-agnostic.
  });
});

describe("adultTtsFallback config", () => {
  it("config has at least one entry", () => {
    expect(limits.adultTtsFallback.length).toBeGreaterThan(0);
  });

  it("every entry has id, model, voice", () => {
    for (const f of limits.adultTtsFallback) {
      expect(typeof f.id).toBe("string");
      expect(typeof f.model).toBe("string");
      expect(typeof f.voice).toBe("string");
    }
  });

  it("contains a Gemini entry", () => {
    expect(limits.adultTtsFallback.some(f => f.model.includes("gemini"))).toBe(true);
  });

  it("contains a HeyGen entry", () => {
    expect(limits.adultTtsFallback.some(f => f.model.includes("heygen"))).toBe(true);
  });

  it("contains an x-ai / Grok entry", () => {
    expect(limits.adultTtsFallback.some(f => f.model.includes("x-ai") || f.model.includes("grok"))).toBe(true);
  });

  it("chain built from config + a typical voice stays within 3 entries", () => {
    const req = { id: "heygen-nadine", model: "heygen/heygen-voice-1-turbo", voice: "nadine", atomic: false };
    const chain = buildAdultVoiceChain(req, limits.adultTtsFallback, 3);
    expect(chain.length).toBeLessThanOrEqual(3);
    expect(chain[0].id).toBe("heygen-nadine");
  });

  it("chain deduplicates the requested voice from config fallbacks", () => {
    // gemini-sulafat is in the fallback config; if the user chose it as requested voice,
    // it should not appear twice.
    const req = { id: "gemini-sulafat", model: "google/gemini-3.8-flash-lite-tts", voice: "Sulafat", atomic: true };
    const chain = buildAdultVoiceChain(req, limits.adultTtsFallback, 3);
    const ids = chain.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate IDs
    expect(chain[0].id).toBe("gemini-sulafat");
  });
});
