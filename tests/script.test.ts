import { describe, expect, it } from "vitest";
import { cleanLines } from "@/lib/prompt";
import { displayTitle, neutralScript, scriptLines, toYouStatement } from "@/lib/script";

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
    expect(lines.at(-1)).toBe("It is done.");
    expect(lines.join(" ")).not.toMatch(/\bsafe\b/i);
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

describe("displayTitle", () => {
  it("strips leading 'You are' and trailing ellipsis from old stored titles", () => {
    expect(displayTitle("You are attracting young beautiful women with…")).toBe("Attracting young beautiful women with");
  });
  it("strips leading 'You have' and cuts to 5 words", () => {
    expect(displayTitle("You have this house by the sea now")).toBe("This house by the sea");
  });
  it("strips a bare leading 'You'", () => {
    expect(displayTitle("You got this calm feeling")).toBe("Got this calm feeling");
  });
  it("cuts to 5 words without adding ellipsis", () => {
    expect(displayTitle("Calm and confident in every situation that arises")).toBe("Calm and confident in every");
    expect(displayTitle("Calm and confident in every situation that arises")).not.toMatch(/…|\.\.\./);
  });
  it("leaves short clean titles unchanged", () => {
    expect(displayTitle("Magnetic confidence")).toBe("Magnetic confidence");
    expect(displayTitle("A moment of calm")).toBe("A moment of calm");
    expect(displayTitle("Calm sleep")).toBe("Calm sleep");
  });
  it("strips trailing ellipsis from old 7-word titles", () => {
    expect(displayTitle("You are calm and confident when you…")).not.toMatch(/…|\.\.\./);
    expect(displayTitle("You are calm and confident when you…")).toBe("Calm and confident when you");
  });
  it("is case-insensitive for the filler prefix", () => {
    expect(displayTitle("you are calm")).toBe("Calm");
    expect(displayTitle("YOU HAVE peace")).toBe("Peace");
  });
  it("capitalises the first letter", () => {
    expect(displayTitle("magnetic confidence")).toBe("Magnetic confidence");
  });
  it("is idempotent on clean AI titles", () => {
    expect(displayTitle(displayTitle("Magnetic confidence"))).toBe("Magnetic confidence");
    expect(displayTitle(displayTitle("Calm sleep"))).toBe("Calm sleep");
  });
});

describe("scriptLines (the server's script sent with a failed recording)", () => {
  it("accepts a short list of short lines", () => {
    const l = ["Breathe in.", "You own the house by the sea.", "It is done."];
    expect(scriptLines(l)).toEqual(l);
  });
  it("rejects anything else", () => {
    expect(scriptLines(undefined)).toBeNull();
    expect(scriptLines("You are calm.")).toBeNull();
    expect(scriptLines(["a", "b"])).toBeNull();
    expect(scriptLines(["ok line", 3, "It is done."])).toBeNull();
    expect(scriptLines(["ok line", "x".repeat(201), "It is done."])).toBeNull();
    expect(scriptLines(Array.from({ length: 21 }, () => "Line."))).toBeNull();
  });
});
