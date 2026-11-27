import { describe, expect, it } from "vitest";
import { imagePrompt } from "@/lib/image/prompt";
import { IMAGE_GUIDANCE, imageGate } from "@/lib/image/gate";
import { mockProvider } from "@/lib/image/provider";
import { wishMentionsMinor } from "@/lib/prompt";

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

// ── wishMentionsMinor ────────────────────────────────────────────────────────

describe("wishMentionsMinor", () => {
  it("matches a minor word without needing an intimacy word", () => {
    expect(wishMentionsMinor("pretty girls at the beach")).toBe(true);
    expect(wishMentionsMinor("kids playing in a park")).toBe(true);
    expect(wishMentionsMinor("a student in a classroom")).toBe(true);
    expect(wishMentionsMinor("my little sister smiling")).toBe(true);
    expect(wishMentionsMinor("a teen with a guitar")).toBe(true);
    expect(wishMentionsMinor("young girl")).toBe(true);
  });

  it("allows the young-women/men early-twenties exception from PR 201", () => {
    expect(wishMentionsMinor("attractive young women smiling at me")).toBe(false);
    expect(wishMentionsMinor("young men who look confident")).toBe(false);
  });

  it("allows wishes with no minor words", () => {
    expect(wishMentionsMinor("a calm beach with no people")).toBe(false);
    expect(wishMentionsMinor("confident women at a coffee shop")).toBe(false);
    expect(wishMentionsMinor("photorealistic very attractive women, open and smiling at me in a flirtatious way")).toBe(false);
  });
});

// ── imageGate minor-word check (broader than intimacy) ───────────────────────

describe("imageGate minor-word check", () => {
  const refused = [
    "pretty girls at the beach",
    "kids playing in a park",
    "a student in a classroom",
    "my little sister smiling",
    "a teen with a guitar",
    "young girl",
  ];

  for (const wish of refused) {
    it(`refuses: "${wish}"`, () => {
      const result = imageGate(wish);
      expect(result.allowed, wish).toBe(false);
      if (!result.allowed) expect(result.reason, wish).toBe("minor");
    });
  }

  const allowed = [
    "attractive young women smiling at me",
    "a calm beach with no people",
    "confident women at a coffee shop",
  ];

  for (const wish of allowed) {
    it(`allows: "${wish}"`, () => {
      expect(imageGate(wish).allowed, wish).toBe(true);
    });
  }

  it("C1 acceptance example still passes", () => {
    const wish = "photorealistic very attractive women, open and smiling at me in a flirtatious way";
    expect(imageGate(wish).allowed).toBe(true);
  });
});

// ── imageGate relaxed (issue 215) ────────────────────────────────────────────

describe("imageGate relaxed (issue 215)", () => {
  it("allows non-sexual family wishes and ambiguous words", () => {
    // "sister", "little" are in MINOR but not MINOR_CLEAR; no intimacy word → allowed
    expect(imageGate("my little sister smiling", { relaxed: true }).allowed).toBe(true);
    expect(imageGate("a hug from my sister", { relaxed: true }).allowed).toBe(true);
    expect(imageGate("my mother is proud of me", { relaxed: true }).allowed).toBe(true);
  });

  it("refuses family role + intimacy for relaxed (issue 219 block 4)", () => {
    const cases: [string, string][] = [
      ["kiss my sister", "minor"],
      ["sleep with my stepmother", "minor"],
    ];
    for (const [wish, reason] of cases) {
      const result = imageGate(wish, { relaxed: true });
      expect(result.allowed, wish).toBe(false);
      if (!result.allowed) expect(result.reason, wish).toBe(reason);
    }
  });

  it("still refuses MINOR_CLEAR terms even when relaxed", () => {
    const cases: [string, string][] = [
      ["pretty girls at the beach", "minor"],
      ["kids playing in a park", "minor"],
      ["a teen with a guitar", "minor"],
      ["a student in a classroom", "minor"],
    ];
    for (const [wish, reason] of cases) {
      const result = imageGate(wish, { relaxed: true });
      expect(result.allowed, wish).toBe(false);
      if (!result.allowed) expect(result.reason, wish).toBe(reason);
    }
  });

  it("still refuses real_person for relaxed accounts", () => {
    const result = imageGate("a photo like Taylor Swift", { relaxed: true });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("real_person");
  });

  it("still refuses reference_photo for relaxed accounts", () => {
    const result = imageGate("using my photo, make a portrait", { relaxed: true });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("reference_photo");
  });

  it("relaxed and strict behave the same for adult-only wishes", () => {
    const wish = "attractive women in a coffee shop";
    expect(imageGate(wish, { relaxed: true }).allowed).toBe(true);
    expect(imageGate(wish).allowed).toBe(true);
  });
});

// ── IMAGE_GUIDANCE ────────────────────────────────────────────────────────────

describe("IMAGE_GUIDANCE (issue 215)", () => {
  it("has an entry for each refusal reason", () => {
    expect(typeof IMAGE_GUIDANCE.minor).toBe("string");
    expect(typeof IMAGE_GUIDANCE.real_person).toBe("string");
    expect(typeof IMAGE_GUIDANCE.reference_photo).toBe("string");
  });

  it("none of the guidance strings are empty", () => {
    for (const [key, text] of Object.entries(IMAGE_GUIDANCE)) {
      expect(text.length, key).toBeGreaterThan(0);
    }
  });

  it("guidance strings do not contain wish-specific text", () => {
    // These are the fixed guidance strings — they must never echo a user wish.
    // Verify they contain only the known fixed sentences.
    expect(IMAGE_GUIDANCE.minor).toBe(
      `An image can't be made for this wish. Describe adults only, for example "women in their early twenties".`,
    );
    expect(IMAGE_GUIDANCE.real_person).toBe(
      `An image can't show a named real person. Describe the kind of person instead.`,
    );
    expect(IMAGE_GUIDANCE.reference_photo).toBe(
      `An image can't be made from a photo. Describe the person in words instead.`,
    );
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
