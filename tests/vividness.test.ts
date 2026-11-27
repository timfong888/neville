import { describe, expect, it } from "vitest";
import { namePositions, scoreVividness } from "@/lib/script/vividness";
import { rewriteWant } from "@/lib/prompt";

// --- scoreVividness ---

describe("scoreVividness — good scripts", () => {
  it("passes a vivid present-tense script", () => {
    const lines = [
      "You open the app and the number glows steady on the screen.",
      "It has climbed again since morning.",
      "A quiet ease settles in your chest.",
      "The key turns and the door swings open to your place.",
      "You step inside and smell the warm wood.",
      "The light is gold through the windows.",
      "You set your bag down on the floor.",
      "This is simply yours now.",
      "It is done.",
    ];
    const r = scoreVividness(lines);
    expect(r.pass).toBe(true);
    expect(r.reasons).toHaveLength(0);
  });
});

describe("scoreVividness — failures", () => {
  it("fails when a hedge word 'will' is present", () => {
    const lines = [
      "Someday you will have everything.",
      "The light glows warm.",
      "You hold the key steady.",
    ];
    const r = scoreVividness(lines);
    expect(r.pass).toBe(false);
    expect(r.reasons.some((x) => x.startsWith("hedge_word"))).toBe(true);
  });

  it("fails when hedge word 'want' is in the script", () => {
    const lines = [
      "You want to feel better.",
      "Light enters the room.",
      "You hear birdsong outside.",
    ];
    const r = scoreVividness(lines);
    expect(r.pass).toBe(false);
    expect(r.reasons.some((x) => x.includes("want"))).toBe(true);
  });

  it("fails when there are fewer than 2 sense words", () => {
    const lines = [
      "The abundance is real.",
      "Success is here.",
      "You are wealthy.",
    ];
    const r = scoreVividness(lines);
    expect(r.pass).toBe(false);
    expect(r.reasons).toContain("too_few_sense_words");
  });

  it("fails when a sentence exceeds 12 words", () => {
    const lines = [
      "You feel warm and the number on the screen is rising up steadily every day.",
      "Light fills the room.",
      "You hear the sound of water.",
    ];
    const r = scoreVividness(lines);
    expect(r.pass).toBe(false);
    expect(r.reasons).toContain("sentence_too_long");
  });

  it("flags a bare claim line of 6 words or fewer", () => {
    const lines = [
      "The wealth is yours.",
      "Success is yours.",
    ];
    const r = scoreVividness(lines);
    expect(r.pass).toBe(false);
    expect(r.reasons).toContain("bare_claim");
  });
});

// --- namePositions and name frequency ---

describe("namePositions", () => {
  it("finds word-level positions of the name", () => {
    const lines = ["Tim, you open the door.", "You feel ease, Tim.", "It is done."];
    const pos = namePositions(lines, "Tim");
    expect(pos).toHaveLength(2);
    // "Tim" is first word of first line (offset 0) and 5th word of second line (offset 4+1=5... let me count)
    // Line 1: Tim(0) you(1) open(2) the(3) door(4)
    // Line 2: You(5) feel(6) ease(7) Tim(8)
    expect(pos[0]).toBe(0);
    expect(pos[1]).toBe(8);
  });

  it("returns empty array when name is empty", () => {
    expect(namePositions(["You feel warm."], "")).toHaveLength(0);
  });

  it("is case-insensitive", () => {
    const lines = ["TIM, you hold the warm mug.", "You step outside, tim."];
    expect(namePositions(lines, "Tim")).toHaveLength(2);
  });
});

describe("scoreVividness — name frequency", () => {
  const nameOpts = { nameMin: 5, nameMax: 8, minGapWords: 10 };

  it("passes when name appears 5–8 times with enough gap", () => {
    const lines = [
      "Alex, you open the door and the warm wood smell meets you.",
      "The light is gold through the window and you breathe full.",
      "Alex, you hold a cool glass and feel steady here.",
      "You hear the gentle sound from the next room outside.",
      "Alex, your chest is calm and your shoulders are loose.",
      "The glow through the glass is warm and clear to you.",
      "It is here with you, Alex, and all is steady.",
      "You step out through the arch and breathe the cool air.",
      "Alex, it is done.",
    ];
    const r = scoreVividness(lines, "Alex", nameOpts);
    expect(r.reasons.some((x) => x.startsWith("name_count") || x === "name_too_close")).toBe(false);
  });

  it("fails name_count when name appears only once", () => {
    const lines = [
      "Sam, you open the door and smell warm wood.",
      "The light glows gold through the window.",
      "You hold a cool glass in your steady hands.",
      "You hear the gentle chime from outside.",
      "It is done.",
    ];
    const r = scoreVividness(lines, "Sam", nameOpts);
    expect(r.reasons.some((x) => x.startsWith("name_count"))).toBe(true);
  });

  it("fails name_too_close when name appears in consecutive sentences", () => {
    const lines = [
      "Jo, you feel warm and ease fills your chest.",
      "Jo, the light is bright through the window.",
      "You hold the key and breathe steady and slow.",
      "The sound of laughter carries from outside your door.",
      "It is done.",
    ];
    const r = scoreVividness(lines, "Jo", nameOpts);
    expect(r.reasons).toContain("name_too_close");
  });

  it("skips name check when name is empty", () => {
    const lines = [
      "You open the door and smell warm wood.",
      "The light glows gold through the window.",
      "You hold a cool glass in your steady hands.",
      "You hear the gentle chime from outside.",
      "It is done.",
    ];
    const r = scoreVividness(lines, "", nameOpts);
    expect(r.reasons.some((x) => x.startsWith("name_count") || x === "name_too_close")).toBe(false);
  });

  it("skips name check when nameOpts is not provided", () => {
    const lines = [
      "You feel warm and ease fills your chest.",
      "Light glows bright through the window.",
      "It is done.",
    ];
    const r = scoreVividness(lines, "Alex");
    expect(r.reasons.some((x) => x.startsWith("name_count") || x === "name_too_close")).toBe(false);
  });

  it("fails name_placement_uniform when all placements are at sentence start", () => {
    const lines = [
      "Alex, you open the door and the warm wood smell fills you.",
      "The light is gold through the window and you breathe full.",
      "Alex, you hold a cool glass and feel steady here.",
      "You hear the gentle sound from the next room outside.",
      "Alex, your chest is calm and your shoulders are loose.",
      "The glow through the glass is warm and clear today.",
      "You step out through the arch and breathe the cool air.",
      "Alex, it is simply here and done for you now.",
      "Alex, you are someone who goes where you choose.",
    ];
    const r = scoreVividness(lines, "Alex", nameOpts);
    expect(r.reasons).toContain("name_placement_uniform");
  });

  it("uses min 3 for scripts under 60 words", () => {
    const lines = [
      "Alex, you open the door and the light is warm.",
      "You hear the chime from outside.",
      "Alex, you hold the key steady.",
      "It is here with you, Alex.",
    ];
    // ~25 words < 60; Alex appears 3 times; with short-script min=3 this passes.
    const r = scoreVividness(lines, "Alex", nameOpts);
    expect(r.reasons.some((x) => x.startsWith("name_count"))).toBe(false);
  });

  it("fails name_count even on short scripts when fewer than 3 uses", () => {
    const lines = [
      "Alex, you open the door and the light is warm.",
      "You hear the chime from outside.",
      "It is here with you now.",
    ];
    // ~18 words < 60; Alex appears 1 time → below short-script min of 3.
    const r = scoreVividness(lines, "Alex", nameOpts);
    expect(r.reasons.some((x) => x.startsWith("name_count"))).toBe(true);
  });
});

describe("scoreVividness — thanks language", () => {
  it("fails when script contains 'thank you'", () => {
    const lines = [
      "You step into the light and your chest is warm.",
      "Thank you, thank you, thank you.",
    ];
    const r = scoreVividness(lines);
    expect(r.pass).toBe(false);
    expect(r.reasons.some((x) => x.startsWith("thanks_language"))).toBe(true);
  });

  it("fails when script contains 'grateful'", () => {
    const lines = [
      "You breathe easy and feel the warm light on your face.",
      "You are grateful for all of this.",
    ];
    const r = scoreVividness(lines);
    expect(r.pass).toBe(false);
    expect(r.reasons.some((x) => x.startsWith("thanks_language"))).toBe(true);
  });

  it("fails when script contains 'blessed'", () => {
    const lines = [
      "You hold the key and your chest is calm.",
      "You feel blessed and the light is gold.",
    ];
    const r = scoreVividness(lines);
    expect(r.pass).toBe(false);
    expect(r.reasons.some((x) => x.startsWith("thanks_language"))).toBe(true);
  });

  it("passes a vivid script with no thanks language", () => {
    const lines = [
      "You open the door and the warm wood smell meets you.",
      "The light is gold and your chest is calm.",
      "It is done.",
    ];
    const r = scoreVividness(lines);
    expect(r.reasons.some((x) => x.startsWith("thanks_language"))).toBe(false);
  });
});

// --- rewriteWant — 6 want-style wish tests ---

describe("rewriteWant", () => {
  it("rewrites 'I want a house' to present-tense having", () => {
    const r = rewriteWant("I want a house by the sea");
    expect(r).not.toMatch(/\bwant\b/i);
    expect(r).toMatch(/^I have/i);
  });

  it("rewrites 'I want to be' to 'I am'", () => {
    expect(rewriteWant("I want to be financially free")).toBe("I am financially free");
  });

  it("rewrites 'I hope to get' — removes hope", () => {
    const r = rewriteWant("I hope to get a promotion");
    expect(r).not.toMatch(/\bhope\b/i);
  });

  it("rewrites 'I will travel the world' — removes will", () => {
    const r = rewriteWant("I will travel the world");
    expect(r).not.toMatch(/\bwill\b/i);
    expect(r).toMatch(/^I travel/i);
  });

  it("rewrites 'I try to feel confident' — removes try", () => {
    const r = rewriteWant("I try to feel confident");
    expect(r).not.toMatch(/\btry\b/i);
  });

  it("rewrites 'I wish I had a loving partner' — removes wish", () => {
    const r = rewriteWant("I wish I had a loving partner");
    expect(r).not.toMatch(/\bwish\b/i);
    expect(r).toMatch(/^I have/i);
  });

  it("leaves an already-present-tense wish unchanged", () => {
    const wish = "I am at home in my house by the sea";
    expect(rewriteWant(wish)).toBe(wish);
  });

  it("leaves a third-person present-tense wish unchanged", () => {
    const wish = "My bitcoin portfolio shows a rising value every morning";
    expect(rewriteWant(wish)).toBe(wish);
  });
});
