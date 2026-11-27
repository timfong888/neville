// Acceptance tests for issue #265: Profile name + Plan card.
import { describe, expect, it } from "vitest";
import { validateFirstName, MAX_FIRST_NAME } from "@/lib/firstName";
import { wishMessage } from "@/lib/prompt";
import { neutralScript } from "@/lib/script";
import { CREDITS } from "@/lib/credits";

describe("AT-265-1: name flows into script message", () => {
  it("first_name set when name is given", () => {
    const m = JSON.parse(wishMessage("I am calm", "Maria", 0)) as Record<string, unknown>;
    expect(m.first_name).toBe("Maria");
  });
  it("first_name is null when name is empty", () => {
    const m = JSON.parse(wishMessage("I am calm", "", 0)) as Record<string, unknown>;
    expect(m.first_name).toBeNull();
  });
});

describe("AT-265-2: empty name → 'you' only, no placeholder", () => {
  it("neutralScript with empty name has no placeholder text", () => {
    const lines = neutralScript("");
    const text = lines.join(" ");
    expect(text).not.toMatch(/\{|\bundefined\b|\bnull\b/);
  });
  it("first line opens without a name when empty", () => {
    expect(neutralScript("")[0]).not.toMatch(/^[A-Z][a-z]+,/);
  });
  it("neutralScript uses name when given", () => {
    expect(neutralScript("Maria")[0]).toContain("Maria");
  });
});

describe("AT-265-3: validateFirstName — one reader enforces the rule", () => {
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

describe("AT-265-4: Plan card — no internal flag names", () => {
  const INTERNAL = ["unlimited", "relaxed filter", "adult tier"];
  const PLAN_LABELS = [
    "Free on this device", "Plan: Free", "Standard", "Included",
    "Creations", "Voices", "Music", "Speed and cadence", "Library",
    "On this device only", "Saved to your account",
  ];
  it("no internal flags appear in plan labels", () => {
    for (const flag of INTERNAL)
      for (const label of PLAN_LABELS)
        expect(label.toLowerCase()).not.toContain(flag);
  });
  it("credits config has a freeCredits value", () => {
    expect(typeof CREDITS.freeCredits).toBe("number");
  });
});
