import { describe, expect, it } from "vitest";
import { imagePrompt } from "@/lib/image/prompt";
import { imageGate } from "@/lib/image/gate";
import { mockProvider } from "@/lib/image/provider";

// ── imagePrompt ──────────────────────────────────────────────────────────────

describe("imagePrompt", () => {
  it("produces a 9:16 vertical photo spec", () => {
    const p = imagePrompt("attractive women smiling at me");
    expect(p).toMatch(/9:16 vertical/i);
  });

  it("includes the raw phone-camera spec", () => {
    const p = imagePrompt("a calm beach scene");
    expect(p).toMatch(/smartphone/i);
    expect(p).toMatch(/26-35mm/i);
  });

  it("includes the standard avoid list", () => {
    const p = imagePrompt("any wish");
    expect(p).toMatch(/plastic skin/i);
    expect(p).toMatch(/extra limbs/i);
    expect(p).toMatch(/deformed fingers/i);
    expect(p).toMatch(/duplicate people/i);
    expect(p).toMatch(/CG look/i);
    expect(p).toMatch(/watermarks/i);
    expect(p).toMatch(/logos/i);
  });

  it("states women as adults in their early twenties", () => {
    const p = imagePrompt("photorealistic very attractive women, open and smiling at me in a flirtatious way");
    expect(p).toMatch(/adult women in their early twenties/i);
    expect(p).not.toMatch(/\bwomen\b(?! in their early twenties)/i);
  });

  it("states men as adults in their early twenties", () => {
    const p = imagePrompt("attractive men who look confident");
    expect(p).toMatch(/adult men in their early twenties/i);
  });

  it("requests exactly one photo, no collages", () => {
    const p = imagePrompt("a beautiful park scene");
    expect(p).toMatch(/only one complete photo/i);
    expect(p).toMatch(/no collages/i);
  });

  it("includes the wish subject in the prompt", () => {
    const p = imagePrompt("a calm sunset over the ocean");
    expect(p).toContain("a calm sunset over the ocean");
  });
});

// ── imageGate ────────────────────────────────────────────────────────────────

describe("imageGate", () => {
  it("C1: allows an adult romantic wish and prompt says adult women in early twenties", () => {
    const wish = "photorealistic very attractive women, open and smiling at me in a flirtatious way";
    const result = imageGate(wish);
    expect(result.allowed).toBe(true);
    // The prompt builder states adults
    expect(imagePrompt(wish)).toMatch(/adult women in their early twenties/i);
  });

  it("C2: refuses a wish with a minor word and intimate intent", () => {
    const result = imageGate("a young girl, romantic");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("minor");
  });

  it("C3: refuses a wish naming a real person", () => {
    const result = imageGate("a photo that looks like Taylor Swift");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("real_person");
  });

  it("refuses a wish naming another real person", () => {
    const result = imageGate("make me look like Barack Obama");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("real_person");
  });

  it("refuses a wish with a reference photo", () => {
    const result = imageGate("using my photo, make a portrait");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("reference_photo");
  });

  it("refuses a wish with an uploaded photo reference", () => {
    const result = imageGate("based on this photo of me, draw a portrait");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("reference_photo");
  });

  it("checks minor before real_person", () => {
    // Both minor and proper name: minor wins as the first check
    const result = imageGate("a romantic kiss with young girl Emma Stone");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("minor");
  });

  it("allows neutral non-person wishes", () => {
    expect(imageGate("a calm beach at sunset with no people").allowed).toBe(true);
    expect(imageGate("a mountain landscape in the morning light").allowed).toBe(true);
  });

  it("allows a wish about attractive women (no minor, no real name)", () => {
    expect(imageGate("very attractive and confident women at a coffee shop").allowed).toBe(true);
  });

  it("refuses explicit sexual content about minors", () => {
    const result = imageGate("naked teenager");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("minor");
  });
});

// ── mockProvider ─────────────────────────────────────────────────────────────

describe("mockProvider", () => {
  it("resolves with bytes and mime without network", async () => {
    const result = await mockProvider.generate("any prompt", "9:16");
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.bytes.length).toBeGreaterThan(0);
    expect(result.mime).toBe("image/png");
  });

  it("placeholder bytes begin with the PNG signature", async () => {
    const { bytes } = await mockProvider.generate("any prompt", "9:16");
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    expect(bytes[2]).toBe(0x4e);
    expect(bytes[3]).toBe(0x47);
  });

  it("resolves for any prompt text", async () => {
    await expect(mockProvider.generate("", "9:16")).resolves.toBeDefined();
    await expect(mockProvider.generate("a very long prompt".repeat(50), "9:16")).resolves.toBeDefined();
  });
});
