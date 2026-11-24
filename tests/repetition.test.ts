import { describe, expect, it } from "vitest";
import { GAP_MS, MAX_REPEAT_MINUTES, REPEAT_MINUTES, buildSession, clampMinutes, gapAt, parseWav, resample, toWav } from "@/lib/repetition";

const rate = 8000;
const sec = (s: number) => Math.round(s * rate);

/** A recording of 3 script lines (the last is the closing) and a refrain, each a run of a distinct value. */
function recording() {
  const parts = [
    { v: 100, s: 2 }, // line 1
    { v: 200, s: 2 }, // line 2
    { v: 300, s: 1 }, // closing
    { v: 400, s: 1.5 }, // refrain
  ];
  const pcm = new Int16Array(parts.reduce((n, p) => n + sec(p.s), 0));
  const starts: number[] = [];
  let at = 0;
  for (const p of parts) {
    starts.push(at / pcm.length);
    pcm.fill(p.v, at, at + sec(p.s));
    at += sec(p.s);
  }
  return { pcm, starts, lines: ["Line one.", "Line two.", "It is done."], refrain: "The house is mine, thank you." };
}

describe("programming mode settings", () => {
  it("offers Off to 20 minutes and clamps anything else", () => {
    expect(REPEAT_MINUTES).toEqual([0, 1, 3, 5, 10, 20]);
    expect(clampMinutes(3)).toBe(3);
    expect(clampMinutes(-1)).toBe(0);
    expect(clampMinutes("x")).toBe(0);
    expect(clampMinutes(90)).toBe(MAX_REPEAT_MINUTES);
  });
  it("lets the silence after each repetition grow from 3 s to 6 s", () => {
    expect(gapAt(0)).toBe(GAP_MS[0]);
    expect(gapAt(1)).toBe(GAP_MS[1]);
    expect(gapAt(0.5)).toBe(4500);
  });
});

describe("buildSession", () => {
  it("plays the script, then the refrain on a loop for the minutes, then the closing", () => {
    const r = recording();
    const s = buildSession({ pcm: r.pcm, rate, starts: r.starts, scriptLines: r.lines, refrain: r.refrain, minutes: 1 })!;
    expect(s).not.toBeNull();
    // Script body first, closing last.
    expect(s.pcm[0]).toBe(100);
    expect(s.pcm[sec(2) + 10]).toBe(200);
    expect(s.pcm[s.pcm.length - 10]).toBe(300);
    // About a minute of loop: whole repetitions until the minute is reached.
    const loop = s.pcm.length - sec(5);
    expect(loop).toBeGreaterThanOrEqual(sec(60));
    expect(loop).toBeLessThan(sec(60 + 1.5 + 6));
    expect(s.repeats).toBeGreaterThan(8);
    // The refrain starts right after the script body.
    expect(s.pcm[sec(4) + 10]).toBe(400);
    expect(s.lines).toEqual(["Line one.", "Line two.", r.refrain, "It is done."]);
    expect(s.starts[2]).toBeCloseTo(sec(4) / s.pcm.length, 3);
    expect(s.starts[3]).toBeCloseTo((s.pcm.length - sec(1)) / s.pcm.length, 3);
  });

  it("keeps the script alone, without the refrain, for saving", () => {
    const r = recording();
    const s = buildSession({ pcm: r.pcm, rate, starts: r.starts, scriptLines: r.lines, refrain: r.refrain, minutes: 3 })!;
    expect(s.script.length).toBe(sec(5));
    expect([...s.script].includes(400)).toBe(false);
  });

  it("rings the bell at the start of each silence when it is on", () => {
    const r = recording();
    const bell = new Int16Array(sec(1)).fill(999);
    const s = buildSession({ pcm: r.pcm, rate, starts: r.starts, scriptLines: r.lines, refrain: r.refrain, minutes: 1, bell })!;
    const firstGap = sec(4) + sec(1.5);
    expect(s.pcm[firstGap + 5]).toBe(999);
    expect(s.pcm[firstGap + sec(1) + 5]).toBe(0);
    // A bell longer than the silence fades out instead of stopping hard.
    const long = new Int16Array(sec(10)).fill(999);
    const cut = buildSession({ pcm: r.pcm, rate, starts: r.starts, scriptLines: r.lines, refrain: r.refrain, minutes: 1, bell: long })!;
    const gapEnd = firstGap + Math.round((3000 * rate) / 1000);
    expect(cut.pcm[gapEnd - 1]).toBe(0);
    expect(Math.abs(cut.pcm[gapEnd - Math.round(rate * 0.02)])).toBeLessThan(600);
    expect(cut.pcm[gapEnd - Math.round(rate * 0.1)]).toBe(999);
    const off = buildSession({ pcm: r.pcm, rate, starts: r.starts, scriptLines: r.lines, refrain: r.refrain, minutes: 1 })!;
    expect(off.pcm[firstGap + 5]).toBe(0);
  });

  it("with repetition off, gives the script alone", () => {
    const r = recording();
    const s = buildSession({ pcm: r.pcm, rate, starts: r.starts, scriptLines: r.lines, refrain: r.refrain, minutes: 0 })!;
    expect(s.pcm.length).toBe(sec(5));
    expect(s.repeats).toBe(0);
    expect(s.lines).toEqual(r.lines);
  });

  it("gives null when the starts do not fit the recording", () => {
    const r = recording();
    expect(buildSession({ pcm: r.pcm, rate, starts: r.starts.slice(0, 3), scriptLines: r.lines, refrain: r.refrain, minutes: 1 })).toBeNull();
    expect(buildSession({ pcm: r.pcm, rate, starts: [0, 0.5, 0.4, 0.9], scriptLines: r.lines, refrain: r.refrain, minutes: 1 })).toBeNull();
  });
});

describe("WAV helpers", () => {
  it("round-trips 16-bit mono PCM", () => {
    const pcm = Int16Array.from([1, -2, 3, 32767, -32768]);
    const back = parseWav(toWav(pcm, 24000))!;
    expect(back.rate).toBe(24000);
    expect([...back.pcm]).toEqual([...pcm]);
  });
  it("refuses what is not WAV", () => {
    expect(parseWav(new ArrayBuffer(10))).toBeNull();
    expect(parseWav(new TextEncoder().encode("ID3" + "x".repeat(60)).buffer as ArrayBuffer)).toBeNull();
  });
  it("resamples to the target rate", () => {
    expect(resample(new Int16Array(24000), 24000, 22050).length).toBe(22050);
  });
});

describe("scriptOnly (when the loop cannot be built)", () => {
  it("cuts the recording before the refrain", async () => {
    const { scriptOnly } = await import("@/lib/repetitionClient");
    const r = recording();
    const url = await scriptOnly(new Blob([toWav(r.pcm, rate)]), r.starts[3]);
    expect(url).not.toBeNull();
    const back = parseWav(await (await fetch(url!)).arrayBuffer())!;
    expect(back.pcm.length).toBe(sec(5));
    expect([...back.pcm].includes(400)).toBe(false);
  });
  it("gives null for audio it cannot cut", async () => {
    const { scriptOnly } = await import("@/lib/repetitionClient");
    expect(await scriptOnly(new Blob(["ID3 not a wav"]), 0.8)).toBeNull();
  });
});
