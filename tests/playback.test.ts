import { describe, expect, it } from "vitest";
import { backPos, nextPos, playOrder, silenceWav, skipPos } from "@/lib/playback";

describe("playOrder", () => {
  it("is in order without shuffle", () => {
    expect(playOrder(4, false)).toEqual([0, 1, 2, 3]);
  });

  it("shuffles every track once, starting from the tapped one", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const o = playOrder(6, true, 3, rnd);
    expect(o[0]).toBe(3);
    expect([...o].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("what plays next", () => {
  it("stops at the end with repeat off, wraps with repeat all, stays with repeat one", () => {
    expect(nextPos(1, 3, "off")).toBe(2);
    expect(nextPos(2, 3, "off")).toBe(-1);
    expect(nextPos(2, 3, "all")).toBe(0);
    expect(nextPos(1, 3, "one")).toBe(1);
  });

  it("next tap moves on even with repeat one", () => {
    expect(skipPos(1, 3, "one")).toBe(2);
    expect(skipPos(2, 3, "one")).toBe(0);
    expect(skipPos(2, 3, "off")).toBe(-1);
  });

  it("previous restarts after 3 s, else goes back", () => {
    expect(backPos(2, 3, 10, "off")).toBe(2);
    expect(backPos(2, 3, 1, "off")).toBe(1);
    expect(backPos(0, 3, 1, "off")).toBe(0);
    expect(backPos(0, 3, 1, "all")).toBe(2);
  });
});

describe("silenceWav", () => {
  it("is a valid WAV of the right length, all zero", () => {
    const b = silenceWav(2500);
    const v = new DataView(b);
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe("RIFF");
    expect(v.getUint32(40, true)).toBe(8000 * 2.5 * 2);
    expect(new Uint8Array(b, 44).every((x) => x === 0)).toBe(true);
  });
});
