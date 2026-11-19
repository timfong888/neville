import { describe, expect, it } from "vitest";
import {
  addItem,
  linesFromText,
  makePlaylist,
  type Manifestation,
  moveItem,
  newestFirst,
  parseLibrary,
  removeItem,
  renamePlaylist,
  resolveItems,
  withoutManifestation,
} from "@/lib/library/model";

const m = (id: string, createdAt: number): Manifestation => ({
  id,
  title: `T ${id}`,
  want: "w",
  firstName: "",
  lines: ["a", "b"],
  voiceId: "v",
  voiceName: "V",
  hasAudio: false,
  createdAt,
  updatedAt: createdAt,
});

describe("playlists", () => {
  it("adds once, in order, and keeps a default name", () => {
    let p = makePlaylist("  ");
    expect(p.name).toBe("My playlist");
    p = addItem(addItem(addItem(p, "a"), "b"), "a");
    expect(p.itemIds).toEqual(["a", "b"]);
  });

  it("moves items and clamps at the ends", () => {
    const p = ["a", "b", "c"].reduce((acc, id) => addItem(acc, id), makePlaylist("x"));
    expect(moveItem(p, 0, 1).itemIds).toEqual(["b", "a", "c"]);
    expect(moveItem(p, 2, -1).itemIds).toEqual(["a", "c", "b"]);
    expect(moveItem(p, 0, -1)).toBe(p);
    expect(moveItem(p, 2, 1)).toBe(p);
    expect(moveItem(p, 9, 1)).toBe(p);
  });

  it("removes by index and ignores bad indexes", () => {
    const p = ["a", "b"].reduce((acc, id) => addItem(acc, id), makePlaylist("x"));
    expect(removeItem(p, 0).itemIds).toEqual(["b"]);
    expect(removeItem(p, 5)).toBe(p);
  });

  it("does not rename to blank", () => {
    const p = makePlaylist("Morning");
    expect(renamePlaylist(p, "   ")).toBe(p);
    expect(renamePlaylist(p, " Evening ").name).toBe("Evening");
  });

  it("plays in playlist order and skips deleted items", () => {
    const ms = [m("a", 1), m("b", 2)];
    const p = ["b", "gone", "a"].reduce((acc, id) => addItem(acc, id), makePlaylist("x"));
    expect(resolveItems(p, ms).map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("deleting a manifestation removes it from every playlist", () => {
    const p = ["a", "b"].reduce((acc, id) => addItem(acc, id), makePlaylist("x"));
    const lib = withoutManifestation({ manifestations: [m("a", 1), m("b", 2)], playlists: [p] }, "a");
    expect(lib.manifestations.map((x) => x.id)).toEqual(["b"]);
    expect(lib.playlists[0].itemIds).toEqual(["b"]);
  });

  it("Play all is newest first", () => {
    expect(newestFirst([m("old", 1), m("new", 3), m("mid", 2)]).map((x) => x.id)).toEqual(["new", "mid", "old"]);
  });
});

describe("stored data", () => {
  it("drops malformed records and dangling playlist items", () => {
    const lib = parseLibrary({
      manifestations: [m("a", 1), { id: "bad" }, null],
      playlists: [{ ...makePlaylist("p"), itemIds: ["a", "zzz"] }, { id: 3 }],
    });
    expect(lib.manifestations.map((x) => x.id)).toEqual(["a"]);
    expect(lib.playlists).toHaveLength(1);
    expect(lib.playlists[0].itemIds).toEqual(["a"]);
  });

  it("treats junk as an empty library", () => {
    expect(parseLibrary("nope")).toEqual({ manifestations: [], playlists: [] });
    expect(parseLibrary(null)).toEqual({ manifestations: [], playlists: [] });
  });

  it("reads an edited script one line per row", () => {
    expect(linesFromText("  one \n\n two  three \r\n")).toEqual(["one", "two three"]);
  });
});
