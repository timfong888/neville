// AT-297: Selector highlights the opposite option.
//
// Bug: create.tsx uses disabled={c.scriptMode === buttonMode}, which applies s.off
// (opacity 0.45) to the SELECTED button — the visual is inverted.
// Fix: use active={c.scriptMode === buttonMode} and remove the disabled prop.
// The request mode is NOT inverted: state.scriptMode is set correctly by setScriptMode;
// only the visual representation was wrong.
//
// AT-3 (regression): these tests fail on current main because selectorButtonActive
// is not exported from @/lib/create (the function does not exist there yet).
import { describe, it, expect } from "vitest";
import { selectorButtonActive } from "@/lib/create";
import type { ScriptMode } from "@/lib/create";

describe("AT-297: Script mode selector active state", () => {
  it("AT-1: when enhance is selected, the enhance button is active", () => {
    expect(selectorButtonActive("enhance", "enhance")).toBe(true);
  });

  it("AT-1: when enhance is selected, the exact button is inactive", () => {
    expect(selectorButtonActive("enhance", "exact")).toBe(false);
  });

  it("AT-2: when exact is selected, the exact button is active", () => {
    expect(selectorButtonActive("exact", "exact")).toBe(true);
  });

  it("AT-2: when exact is selected, the enhance button is inactive", () => {
    expect(selectorButtonActive("exact", "enhance")).toBe(false);
  });

  it("AT-2: submitted mode matches the active button (enhance)", () => {
    const mode: ScriptMode = "enhance";
    expect(selectorButtonActive(mode, "enhance")).toBe(true);
    expect(selectorButtonActive(mode, "exact")).toBe(false);
  });

  it("AT-2: submitted mode matches the active button (exact)", () => {
    const mode: ScriptMode = "exact";
    expect(selectorButtonActive(mode, "exact")).toBe(true);
    expect(selectorButtonActive(mode, "enhance")).toBe(false);
  });
});
