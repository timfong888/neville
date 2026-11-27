import { describe, expect, it, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { adultTierEnabled, isAdultTierUser } from "@/lib/adult/tier";
import { classifyScript } from "@/lib/adult/outputGate";

// ── lib/adult/tier.ts ─────────────────────────────────────────────────────────

describe("isAdultTierUser", () => {
  afterEach(() => {
    delete process.env.ADULT_TIER_ENABLED;
    delete process.env.ADULT_TIER_EMAILS;
  });

  it("returns false when ADULT_TIER_ENABLED is not set", () => {
    expect(isAdultTierUser("user@example.com")).toBe(false);
  });

  it("returns false when ADULT_TIER_ENABLED=false", () => {
    process.env.ADULT_TIER_ENABLED = "false";
    expect(isAdultTierUser("user@example.com")).toBe(false);
  });

  it("returns false when tier is on but email not in allowlist", () => {
    process.env.ADULT_TIER_ENABLED = "true";
    process.env.ADULT_TIER_EMAILS = "allowed@example.com";
    expect(isAdultTierUser("other@example.com")).toBe(false);
  });

  it("returns true when tier is on and email is in allowlist", () => {
    process.env.ADULT_TIER_ENABLED = "true";
    process.env.ADULT_TIER_EMAILS = "allowed@example.com,second@example.com";
    expect(isAdultTierUser("allowed@example.com")).toBe(true);
    expect(isAdultTierUser("second@example.com")).toBe(true);
  });

  it("is case-insensitive for email matching", () => {
    process.env.ADULT_TIER_ENABLED = "true";
    process.env.ADULT_TIER_EMAILS = "User@Example.COM";
    expect(isAdultTierUser("user@example.com")).toBe(true);
  });

  it("returns false for null email", () => {
    process.env.ADULT_TIER_ENABLED = "true";
    process.env.ADULT_TIER_EMAILS = "allowed@example.com";
    expect(isAdultTierUser(null)).toBe(false);
  });

  it("returns false for undefined email", () => {
    process.env.ADULT_TIER_ENABLED = "true";
    process.env.ADULT_TIER_EMAILS = "allowed@example.com";
    expect(isAdultTierUser(undefined)).toBe(false);
  });

  it("adultTierEnabled reflects ADULT_TIER_ENABLED=true", () => {
    process.env.ADULT_TIER_ENABLED = "true";
    expect(adultTierEnabled()).toBe(true);
  });

  it("adultTierEnabled returns false when not set", () => {
    expect(adultTierEnabled()).toBe(false);
  });

  it("handles whitespace around env values", () => {
    process.env.ADULT_TIER_ENABLED = "  true  ";
    process.env.ADULT_TIER_EMAILS = " allowed@example.com , second@example.com ";
    expect(isAdultTierUser("allowed@example.com")).toBe(true);
    expect(isAdultTierUser("second@example.com")).toBe(true);
  });
});

// ── lib/adult/outputGate.ts ───────────────────────────────────────────────────

describe("classifyScript — passes adult fiction", () => {
  it("passes romantic adult script with no blocked content", () => {
    const lines = [
      "A beautiful woman in her late twenties stands before you.",
      "She is 28 years old, a consenting adult, and her eyes meet yours with warmth.",
      "She reaches out and takes your hand.",
      "You are together, two consenting adults, and she smiles.",
      "She leans close and kisses you.",
      "It is done.",
    ];
    expect(classifyScript(lines).verdict).toBe("pass");
  });

  it("passes generic affirmation lines", () => {
    const lines = ["You stand in your dream home.", "The light fills the room.", "You feel deeply at peace.", "It is done."];
    expect(classifyScript(lines).verdict).toBe("pass");
  });

  it("passes explicit adult content between consenting adults", () => {
    const lines = [
      "A 30-year-old woman is in your arms.",
      "The two of you are intimate, fully consenting and joyful.",
      "She is an adult who chooses this moment freely.",
      "It is done.",
    ];
    expect(classifyScript(lines).verdict).toBe("pass");
  });
});

describe("classifyScript — refuses blocked output", () => {
  it("refuses script containing a minor word", () => {
    const r = classifyScript(["A young girl enters the room.", "It is done."]);
    expect(r.verdict).toBe("refuse");
    if (r.verdict === "refuse") expect(r.category).toBe("minor");
  });

  it("refuses script containing teen", () => {
    const r = classifyScript(["She looks like a teenager.", "It is done."]);
    expect(r.verdict).toBe("refuse");
    if (r.verdict === "refuse") expect(r.category).toBe("minor");
  });

  it("refuses script containing violence", () => {
    const r = classifyScript(["Blood drips from the wound.", "It is done."]);
    expect(r.verdict).toBe("refuse");
    if (r.verdict === "refuse") expect(r.category).toBe("violence");
  });

  it("refuses script containing murder", () => {
    const r = classifyScript(["He is murdered in the scene.", "It is done."]);
    expect(r.verdict).toBe("refuse");
    if (r.verdict === "refuse") expect(r.category).toBe("violence");
  });

  it("refuses script containing non-consent phrase", () => {
    const r = classifyScript(["She was forced into it.", "It is done."]);
    expect(r.verdict).toBe("refuse");
    if (r.verdict === "refuse") expect(r.category).toBe("non_consent");
  });

  it("refuses 'without her consent'", () => {
    const r = classifyScript(["He proceeded without her consent.", "It is done."]);
    expect(r.verdict).toBe("refuse");
    if (r.verdict === "refuse") expect(r.category).toBe("non_consent");
  });

  it("checks minor before violence when both present", () => {
    const r = classifyScript(["A child is killed.", "It is done."]);
    expect(r.verdict).toBe("refuse");
    if (r.verdict === "refuse") expect(r.category).toBe("minor");
  });

  it("checks violence before non_consent when both present", () => {
    const r = classifyScript(["He was murdered without consent.", "It is done."]);
    expect(r.verdict).toBe("refuse");
    if (r.verdict === "refuse") expect(r.category).toBe("violence");
  });
});
