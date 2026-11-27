import { describe, expect, it } from "vitest";
import { parseRerecord, verdict } from "@/lib/rerecord";

describe("re-record request", () => {
  it("accepts a tidy script and keeps the voice id", () => {
    const r = parseRerecord({ lines: ["  You are calm.  ", "", "You are  here."], voiceId: "x" }, 700);
    expect(r).toEqual({ ok: true, value: { lines: ["You are calm.", "You are here."], voiceId: "x", speedStep: null, cadenceStep: null } });
  });

  it("refuses empty, malformed and over-long scripts", () => {
    expect(parseRerecord(null, 700).ok).toBe(false);
    expect(parseRerecord({ lines: "You are calm." }, 700).ok).toBe(false);
    expect(parseRerecord({ lines: [1, 2] }, 700).ok).toBe(false);
    expect(parseRerecord({ lines: ["   "] }, 700).ok).toBe(false);
    const long = parseRerecord({ lines: ["a".repeat(701)] }, 700);
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.error).toContain("701 characters");
    expect(parseRerecord({ lines: Array(41).fill("ok") }, 700).ok).toBe(false);
  });

  it("treats only a clear OK as a yes", () => {
    expect(verdict("OK")).toBe(true);
    expect(verdict(" ok.\n")).toBe(true);
    expect(verdict("NO")).toBe(false);
    expect(verdict("OK, but")).toBe(false);
    expect(verdict("")).toBe(false);
    expect(verdict(undefined)).toBe(false);
  });
});
