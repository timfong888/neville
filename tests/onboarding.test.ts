import { describe, expect, it } from "vitest";
import { ONBOARDED_KEY, STEPS, markSeen, shouldShow } from "@/lib/onboarding";

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("onboarding", () => {
  it("walks create, listen, save, playlist in that order", () => {
    expect(STEPS.map((s) => s.title)).toEqual(["Say what you want", "Listen", "Save it", "Play them together"]);
  });

  it("shows once, then remembers skip or finish", () => {
    const s = mem();
    expect(shouldShow(s)).toBe(true);
    markSeen(s, "skipped", 5);
    expect(shouldShow(s)).toBe(false);
    expect(JSON.parse(s.m.get(ONBOARDED_KEY)!)).toEqual({ how: "skipped", at: 5 });
  });

  it("never opens when storage is missing or throws", () => {
    expect(shouldShow(null)).toBe(false);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(shouldShow(broken)).toBe(false);
    expect(() => markSeen(broken, "done")).not.toThrow();
  });
});
