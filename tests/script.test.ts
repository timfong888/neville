import { describe, expect, it } from "vitest";
import { cleanLines } from "@/lib/prompt";
import { neutralScript, scriptLines, toYouStatement } from "@/lib/script";

describe("neutralScript (the fallback when the text model did not write the script)", () => {
  it("takes no wish at all, so it cannot repeat the visitor's words", () => {
    expect(neutralScript.length).toBe(1); // one parameter: the first name
    const withName = neutralScript("Tim");
    const without = neutralScript("");
    expect(withName.slice(1)).toEqual(without.slice(1));
    expect(withName[0]).toContain("Tim");
    expect(without.join(" ")).not.toContain("Tim");
  });
  it("is a full script by the same rule model output must pass", () => {
    const lines = neutralScript("");
    expect(cleanLines(lines.join("\n"), 700)).toEqual(lines);
    expect(lines.at(-1)).toBe("And so it is.");
  });
  it("speaks to the listener as you, in the present", () => {
    const text = neutralScript("").join(" ");
    expect(text).toMatch(/\bYou are\b/);
    expect(text).not.toMatch(/\bI\b|\byou will\b/i);
  });
});

describe("toYouStatement", () => {
  it("turns a wish into a present-tense you statement", () => {
    expect(toYouStatement("I want to be calm and confident when I speak")).toBe("you are calm and confident when you speak");
    expect(toYouStatement("")).toBe("you are living the life you chose");
  });
});

describe("scriptLines (the server's script sent with a failed recording)", () => {
  it("accepts a short list of short lines", () => {
    const l = ["Breathe in.", "You own the house by the sea.", "And so it is."];
    expect(scriptLines(l)).toEqual(l);
  });
  it("rejects anything else", () => {
    expect(scriptLines(undefined)).toBeNull();
    expect(scriptLines("You are calm.")).toBeNull();
    expect(scriptLines(["a", "b"])).toBeNull();
    expect(scriptLines(["ok line", 3, "And so it is."])).toBeNull();
    expect(scriptLines(["ok line", "x".repeat(201), "And so it is."])).toBeNull();
    expect(scriptLines(Array.from({ length: 21 }, () => "Line."))).toBeNull();
  });
});
