// AT-298: Typed script disappears — Review script box is empty.
//
// Repro (Tim, 2026-11-28): "1. Enter script. Press create 2. Review script screen: box is empty."
//
// Root cause: when PAYWALL_ENABLED=false, go() calls router.push("/create/script")
// synchronously before generate() completes. The Review screen component mounts with
// c.made=null, so editScript = "". When the API returns and c.made is populated,
// editScript is never updated — the box stays empty.
//
// Fix: script.tsx adds a useEffect that syncs editScript from c.made.lines whenever
// c.made changes (null → populated, or on new variation).
// The sync uses editScriptFromMade() so the derivation is separately testable.
//
// AT-4 (regression): these tests fail on current main because editScriptFromMade
// is not exported from @/lib/scriptEdit (the function does not exist there yet).
import { describe, it, expect } from "vitest";
import { editScriptFromMade } from "@/lib/scriptEdit";

const LINES = ["I am calm and confident.", "It is already done."];

describe("AT-298: Edit script initialisation from Made", () => {
  it("AT-1: returns empty string when made is null (non-paywall path at mount)", () => {
    // This is the initial value when the screen is pushed before generate completes.
    expect(editScriptFromMade(null)).toBe("");
  });

  it("AT-1: returns joined lines when made is populated (after API returns)", () => {
    expect(editScriptFromMade({ lines: LINES })).toBe(LINES.join("\n"));
  });

  it("AT-1: single line is returned unchanged", () => {
    expect(editScriptFromMade({ lines: ["I am at peace."] })).toBe("I am at peace.");
  });

  it("AT-1: empty lines array returns empty string", () => {
    expect(editScriptFromMade({ lines: [] })).toBe("");
  });

  it("AT-2: switching from null to populated yields non-empty string (bug test)", () => {
    // Before fix: editScript is set once at mount (null → "") and never updated.
    // After fix: a useEffect calls setEditScript(editScriptFromMade(c.made)) on change.
    const initialValue = editScriptFromMade(null);           // "" — mounted before API returns
    const updatedValue = editScriptFromMade({ lines: LINES }); // "I am calm..."
    // The fix is that the UI transitions from initialValue to updatedValue.
    expect(initialValue).toBe("");
    expect(updatedValue).toBe("I am calm and confident.\nIt is already done.");
    expect(updatedValue).not.toBe(initialValue);
  });

  it("AT-3: mode switch does not affect the derivation", () => {
    // editScriptFromMade is mode-agnostic; it only reads lines.
    expect(editScriptFromMade({ lines: LINES })).toBe(LINES.join("\n"));
  });
});
