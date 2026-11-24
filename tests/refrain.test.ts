import { describe, expect, it } from "vitest";
import { bell, renderRefrain, tone, wavFromPcm } from "@/lib/refrain";

describe("refrain", () => {
  it("writes a valid mono 16-bit WAV header", () => {
    const wav = wavFromPcm(new Int16Array([1, -1, 2]), 22050);
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(v.getUint32(24, true)).toBe(22050);
    expect(v.getUint32(40, true)).toBe(6);
    expect(wav.length).toBe(44 + 6);
    expect(v.getInt16(46, true)).toBe(-1);
  });

  it("starts and ends a tone at zero", () => {
    const t = tone(440, 100, 8000);
    expect(t[0]).toBe(0);
    expect(Math.abs(t[t.length - 1])).toBeLessThan(200);
  });

  it("repeats with no seam: n repeats are n refrains plus n-1 gaps", () => {
    const refrain = new Int16Array([5, 5, 5, 5]);
    const out = renderRefrain({ refrain, rate: 1000, repeats: 3, gapMs: 2 });
    expect(out.length).toBe(3 * 4 + 2 * 2);
    expect([...out]).toEqual([5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5]);
  });

  it("puts the bell between repeats, not after the last, and lengthens the gap to hold it", () => {
    const refrain = new Int16Array([7, 7]);
    const b = new Int16Array([1, 2, 3, 4, 5]);
    const out = renderRefrain({ refrain, rate: 1000, repeats: 2, gapMs: 1, bell: b });
    expect([...out]).toEqual([7, 7, 1, 2, 3, 4, 5, 7, 7]);
  });

  it("makes a bell that fades out", () => {
    const b = bell(8000);
    const peak = (from: number, to: number) => Math.max(...[...b.slice(from, to)].map(Math.abs));
    expect(peak(0, 2000)).toBeGreaterThan(peak(b.length - 2000, b.length));
  });
});
