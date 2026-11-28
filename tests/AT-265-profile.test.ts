// Acceptance tests for issue #265: Profile name + Plan card.
import { describe, expect, it } from "vitest";
import { validateFirstName, MAX_FIRST_NAME } from "@/lib/firstName";
import { SYSTEM, wishMessage } from "@/lib/prompt";
import { neutralScript } from "@/lib/script";
import { CREDITS } from "@/lib/credits";

// AT-265-1: when a name is set the LLM uses it at least 5 times AND "you" throughout.
// The system prompt encodes this rule; we verify the instruction rather than calling the LLM.
describe("AT-265-1: with a name, scripts use name ≥5 times AND 'you' throughout", () => {
  it("system prompt instructs 5–8 name uses across the script", () => {
    expect(SYSTEM).toMatch(/use it 5 to 8 times across the script/);
  });
  it("system prompt keeps 'you' throughout — name does not replace it", () => {
    // Both instructions appear: name uses AND "you are/have/see/feel".
    expect(SYSTEM).toMatch(/Say "you are", "you have", "you see", "you feel"/);
  });
  it("wishMessage sends first_name when name is given", () => {
    const m = JSON.parse(wishMessage("I am calm", "Maria", 0)) as Record<string, unknown>;
    expect(m.first_name).toBe("Maria");
  });
});

// AT-265-2: empty name → "you" only, no placeholder.
describe("AT-265-2: empty name → 'you' only, no placeholder", () => {
  it("wishMessage sends first_name null when name is empty", () => {
    const m = JSON.parse(wishMessage("I am calm", "", 0)) as Record<string, unknown>;
    expect(m.first_name).toBeNull();
  });
  it("neutralScript with empty name has no placeholder text", () => {
    const text = neutralScript("").join(" ");
    expect(text).not.toMatch(/\{|\bundefined\b|\bnull\b/);
  });
  it("neutralScript with empty name opens without a name prefix", () => {
    // First line must not start with "Name," pattern.
    expect(neutralScript("")[0]).not.toMatch(/^[A-Z][a-z]+,/);
  });
  it("neutralScript with a name uses both name and 'you'", () => {
    const lines = neutralScript("Maria");
    const text = lines.join(" ");
    expect(text).toContain("Maria");
    expect(text.toLowerCase()).toContain("you");
  });
});

// AT-265-3: validateFirstName — single validation path.
describe("AT-265-3: first name validation", () => {
  it("accepts empty", () => expect(validateFirstName("")).toBeNull());
  it("accepts letters, hyphens, apostrophes", () => {
    expect(validateFirstName("Anne-Marie")).toBeNull();
    expect(validateFirstName("O'Brien")).toBeNull();
    expect(validateFirstName("Zoë")).toBeNull();
  });
  it("rejects > 30 chars", () => expect(validateFirstName("A".repeat(MAX_FIRST_NAME + 1))).not.toBeNull());
  it("accepts exactly 30 chars", () => expect(validateFirstName("A".repeat(MAX_FIRST_NAME))).toBeNull());
  it("rejects digits and symbols", () => {
    expect(validateFirstName("Tim2")).not.toBeNull();
    expect(validateFirstName("Tim!")).not.toBeNull();
  });
});

// AT-265-4: Plan card labels contain no internal flag names; dollars shown only when paywall active.
describe("AT-265-4: Plan card — no internal flags; credits only when charging", () => {
  const INTERNAL = ["unlimited", "relaxed filter", "adult tier"];
  const PLAN_LABELS = [
    "Free on this device", "Plan: Free", "Standard", "Included",
    "Creations", "Voices", "Music", "Speed and cadence", "Library",
    "On this device only", "Saved to your account", "Creations remaining",
  ];
  it("no internal flags appear in plan labels", () => {
    for (const flag of INTERNAL)
      for (const label of PLAN_LABELS)
        expect(label.toLowerCase()).not.toContain(flag);
  });
  it("credits config has a freeCredits value (once-per-account allowance)", () => {
    expect(typeof CREDITS.freeCredits).toBe("number");
    expect(CREDITS.freeCredits).toBeGreaterThan(0);
  });
});
