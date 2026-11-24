import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DRAFT_STORAGE_KEY, clearDraft, hasDraft, readDraft, startingDraft, writeDraft } from "@/lib/draftStore";

// A minimal browser: localStorage only, as the create page uses it.
let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
});
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("the wish draft (#100)", () => {
  it("keeps the typed wish and name across leaving the page and coming back", () => {
    writeDraft({ want: "A small house by the sea", name: "Tim" });
    // Settings is a separate page: the create page mounts again from nothing.
    expect(startingDraft("")).toEqual({ want: "A small house by the sea", name: "Tim", shared: false });
  });
  it("starts empty when nothing was typed", () => {
    expect(startingDraft("")).toEqual({ want: "", name: "", shared: false });
  });
  it("a shared link fills the form without replacing the listener's own draft", () => {
    writeDraft({ want: "My own wish", name: "Tim" });
    expect(startingDraft("?w=Their%20wish&n=Ana")).toEqual({ want: "Their wish", name: "Ana", shared: true });
    expect(readDraft()).toEqual({ want: "My own wish", name: "Tim" });
  });
  it("clearing both fields removes the draft", () => {
    writeDraft({ want: "x", name: "y" });
    writeDraft({ want: "", name: "" });
    expect(store.has(DRAFT_STORAGE_KEY)).toBe(false);
  });
  it("deleting device data removes the draft, so the next person sees an empty form", () => {
    writeDraft({ want: "A private wish", name: "Tim" });
    expect(hasDraft()).toBe(true);
    clearDraft();
    expect(hasDraft()).toBe(false);
    expect(startingDraft("")).toEqual({ want: "", name: "", shared: false });
  });
  it("caps lengths and ignores a corrupt or blocked store", () => {
    writeDraft({ want: "w".repeat(400), name: "n".repeat(60) });
    expect(readDraft()).toEqual({ want: "w".repeat(280), name: "n".repeat(40) });
    store.set(DRAFT_STORAGE_KEY, "{not json");
    expect(readDraft()).toEqual({ want: "", name: "" });
    (globalThis as { window?: unknown }).window = {
      get localStorage(): never {
        throw new Error("blocked");
      },
    };
    expect(readDraft()).toEqual({ want: "", name: "" });
    expect(() => writeDraft({ want: "a", name: "" })).not.toThrow();
  });
});
