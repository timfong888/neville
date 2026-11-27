import { describe, expect, it } from "vitest";
import { editEnablesRerecord, linesFromText, rrErrorMessage, applyRRResult, applyRerecord, undoRerecord, FILTER_GUIDANCE } from "@/lib/scriptEdit";

describe("scriptEdit", () => {
  describe("editEnablesRerecord — edit enables Re-record", () => {
    it("returns true when lines differ", () => {
      expect(editEnablesRerecord(["Hello.", "World."], "Hello.\nChanged.")).toBe(true);
    });
    it("returns false when lines match after normalisation", () => {
      expect(editEnablesRerecord(["Hello.", "World."], "Hello.\nWorld.")).toBe(false);
    });
    it("returns false when edited text is empty", () => {
      expect(editEnablesRerecord(["Hello."], "")).toBe(false);
    });
    it("returns false when only whitespace differs", () => {
      expect(editEnablesRerecord(["Hello."], "  Hello.  ")).toBe(false);
    });
    it("returns true when a line is added", () => {
      expect(editEnablesRerecord(["A."], "A.\nB.")).toBe(true);
    });
  });

  describe("linesFromText — edited text sent verbatim", () => {
    it("splits on newlines and trims", () => {
      expect(linesFromText("  I am calm.  \nI am at peace.")).toEqual(["I am calm.", "I am at peace."]);
    });
    it("filters blank lines", () => {
      expect(linesFromText("A.\n\n\nB.")).toEqual(["A.", "B."]);
    });
    it("preserves the exact words the user typed (verbatim, no AI rewrite)", () => {
      const typed = "I already have everything I need.\nAbundance flows to me now.";
      expect(linesFromText(typed)).toEqual([
        "I already have everything I need.",
        "Abundance flows to me now.",
      ]);
    });
  });

  describe("rrErrorMessage — filter refusal shows guidance", () => {
    it("maps not_recordable to the guidance note", () => {
      expect(rrErrorMessage("not_recordable", undefined)).toBe(FILTER_GUIDANCE);
    });
    it("passes through the server error for other codes", () => {
      expect(rrErrorMessage("voice_failed", "The voice could not be recorded just now.")).toBe(
        "The voice could not be recorded just now.",
      );
    });
    it("uses a generic fallback when neither code nor error is set", () => {
      expect(rrErrorMessage(undefined, undefined)).toBe("The recording could not be made just now.");
    });
  });

  describe("applyRerecord / undoRerecord — undo restores previous audio", () => {
    it("applyRerecord sets new item and stores prev for undo", () => {
      const before = { url: "blob:original", lines: ["A."] };
      const after = { url: "blob:new", lines: ["B."] };
      const state = applyRerecord({ current: before, prev: null }, after);
      expect(state.current).toBe(after);
      expect(state.prev).toBe(before);
    });
    it("undoRerecord restores the previous audio", () => {
      const before = { url: "blob:original", lines: ["A."] };
      const after = { url: "blob:new", lines: ["B."] };
      const afterRR = applyRerecord({ current: before, prev: null }, after);
      const undone = undoRerecord(afterRR);
      expect(undone.current).toBe(before);
      expect(undone.prev).toBeNull();
    });
    it("undoRerecord is a no-op when no prev is stored", () => {
      const state = { current: { url: "blob:x" }, prev: null };
      expect(undoRerecord(state)).toBe(state);
    });
  });

  describe("applyRRResult — failure keeps old audio", () => {
    it("on failure returns the previous url and the error", () => {
      const result = applyRRResult("blob:old", { ok: false, error: "Voice error." });
      expect(result.url).toBe("blob:old");
      expect(result.error).toBe("Voice error.");
    });
    it("on success returns the new url and no error", () => {
      const result = applyRRResult("blob:old", { ok: true, url: "blob:new" });
      expect(result.url).toBe("blob:new");
      expect(result.error).toBeNull();
    });
    it("on failure with no previous url keeps url as null", () => {
      const result = applyRRResult(null, { ok: false, error: "oops" });
      expect(result.url).toBeNull();
    });
  });
});
