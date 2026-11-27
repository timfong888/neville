import { describe, expect, it } from "vitest";
import type { Manifestation } from "@/lib/library/model";
import { type PlayingState, playingItemId } from "@/lib/playingItemId";

const m = (id: string, hasAudio: boolean): Manifestation => ({
  id, title: id, want: "", firstName: "", lines: [],
  voiceId: "", voiceName: "", hasAudio, createdAt: 0, updatedAt: 0,
});

// Three recordings among four items (b has no audio).
const items = [m("a", true), m("b", false), m("c", true), m("d", true)];

const st = (overrides: Partial<PlayingState>): PlayingState => ({
  status: "idle", id: "", index: 0, ...overrides,
});

describe("playingItemId", () => {
  it("returns null when idle, regardless of id", () => {
    expect(playingItemId(st({}), items)).toBeNull();
    expect(playingItemId(st({ status: "idle", id: "a" }), items)).toBeNull();
    expect(playingItemId(st({ status: "idle", id: "all" }), items)).toBeNull();
  });

  it("returns the item id for a single item playing", () => {
    expect(playingItemId(st({ status: "playing", id: "a" }), items)).toBe("a");
    expect(playingItemId(st({ status: "playing", id: "d" }), items)).toBe("d");
  });

  it("keeps the id while paused on a single item", () => {
    expect(playingItemId(st({ status: "paused", id: "c" }), items)).toBe("c");
  });

  it("returns the id while preparing a single item", () => {
    expect(playingItemId(st({ status: "preparing", id: "a" }), items)).toBe("a");
  });

  describe("Play all (id === 'all')", () => {
    // recordings in items order: a(0), c(1), d(2); b is skipped (no audio)
    it("maps even index to the recording at that position", () => {
      expect(playingItemId(st({ status: "playing", id: "all", index: 0 }), items)).toBe("a");
      expect(playingItemId(st({ status: "playing", id: "all", index: 2 }), items)).toBe("c");
      expect(playingItemId(st({ status: "playing", id: "all", index: 4 }), items)).toBe("d");
    });

    it("maps odd (gap) index to the recording before it", () => {
      expect(playingItemId(st({ status: "playing", id: "all", index: 1 }), items)).toBe("a");
      expect(playingItemId(st({ status: "playing", id: "all", index: 3 }), items)).toBe("c");
      expect(playingItemId(st({ status: "playing", id: "all", index: 5 }), items)).toBe("d");
    });

    it("returns null for an index past the last recording", () => {
      expect(playingItemId(st({ status: "playing", id: "all", index: 6 }), items)).toBeNull();
    });

    it("highlights the first recording while Play all is preparing", () => {
      expect(playingItemId(st({ status: "preparing", id: "all", index: 0 }), items)).toBe("a");
    });

    it("keeps the highlight while paused on a recording clip", () => {
      expect(playingItemId(st({ status: "paused", id: "all", index: 0 }), items)).toBe("a");
      expect(playingItemId(st({ status: "paused", id: "all", index: 2 }), items)).toBe("c");
    });

    it("keeps the highlight while paused in a gap clip", () => {
      expect(playingItemId(st({ status: "paused", id: "all", index: 1 }), items)).toBe("a");
      expect(playingItemId(st({ status: "paused", id: "all", index: 3 }), items)).toBe("c");
    });

    it("(b) with idFromIndex, matches the queue snapshot through a 2-track loop advance even after library items change", () => {
      // Queue was built with [a, b]. Then c was inserted into the library.
      // items.filter(hasAudio) order is now [a, c, b] — mismatched with the queue.
      const changedItems = [m("a", true), m("c", true), m("b", true)];
      // Without idFromIndex: index 2 → pos 1 → "c" (wrong — queue has "b" at this position)
      expect(playingItemId(st({ status: "playing", id: "all", index: 2 }), changedItems)).toBe("c");
      // Queue snapshot: a(0,1), b(2,3)
      const snap = (i: number): string | undefined => ["a", "a", "b", "b"][i];
      // With idFromIndex: matches the queue regardless of current library order
      expect(playingItemId(st({ status: "playing", id: "all", index: 0 }), changedItems, snap)).toBe("a");
      expect(playingItemId(st({ status: "playing", id: "all", index: 1 }), changedItems, snap)).toBe("a");
      expect(playingItemId(st({ status: "playing", id: "all", index: 2 }), changedItems, snap)).toBe("b");
      expect(playingItemId(st({ status: "playing", id: "all", index: 3 }), changedItems, snap)).toBe("b");
    });
  });
});
