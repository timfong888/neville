import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// A stand-in for OpenRouter on this machine: no network, no spend.
vi.mock("server-only", () => ({}));

let server: Server;
const seen: Array<Record<string, unknown>> = [];
let refuseSpeed = false;
let failOn: string | null = null;
/** How many more times a request for `failOn` gets a 500 before it succeeds. */
let failTimes = Infinity;
let failStatus = 500;
/** A request for this input gets 4.2 MB of silence back: too long for one response. */
let bigOn: string | null = null;
/** When set, an atomic request gets speech back: 0.6 s of tone per line with 0.8 s of silence between. */
let voicedAtomic = false;
/** With voicedAtomic: the silence after each line but the last, in ms; default 800 each. */
let atomicGapsMs: number[] | null = null;
/** Delay before an atomic request is answered, in ms. */
let atomicDelayMs = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      const body = JSON.parse(raw);
      if (atomicDelayMs && String(body.input).includes("[pause]")) await new Promise((r) => setTimeout(r, atomicDelayMs));
      seen.push(body);
      if (failOn && body.input === failOn && failTimes > 0) {
        failTimes--;
        res.writeHead(failStatus, { "Content-Type": "application/json" }).end(JSON.stringify({ error: { message: "boom" } }));
        return;
      }
      if (refuseSpeed && "speed" in body) {
        res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: { message: "unknown field speed" } }));
        return;
      }
      if (bigOn && body.input === bigOn) {
        res.writeHead(200, { "Content-Type": "audio/pcm;rate=24000" }).end(Buffer.alloc(4_200_000));
        return;
      }
      if (voicedAtomic && String(body.input).includes("[pause]")) {
        const rate = 24000;
        const parts = String(body.input).split(" [pause] ");
        const tone = Math.round(rate * 0.6);
        const gaps = parts.slice(1).map((_, k) => Math.round((rate * (atomicGapsMs?.[k] ?? 800)) / 1000));
        const pcm = new Int16Array(parts.length * tone + gaps.reduce((n, g) => n + g, 0));
        let at = 0;
        parts.forEach((_, k) => {
          for (let i = 0; i < tone; i++) pcm[at + i] = Math.round(8000 * Math.sin((2 * Math.PI * 220 * i) / rate));
          at += tone + (gaps[k] ?? 0);
        });
        res.writeHead(200, { "Content-Type": "audio/pcm;rate=24000" }).end(Buffer.from(pcm.buffer));
        return;
      }
      // 0.5 s of 44.1 kHz 16-bit mono PCM for PCM requests; a few bytes for MP3.
      const bytes = body.response_format === "pcm" ? Buffer.alloc(44100) : Buffer.from("ID3");
      res.writeHead(200, { "Content-Type": "audio/pcm;rate=44100", "X-Generation-Id": `g${seen.length}` }).end(bytes);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

async function load() {
  vi.resetModules();
  seen.length = 0;
  return (await import("@/lib/server/tts")).synthesize;
}

const lines = ["Breathe in.", "You are calm.", "It is done."];

describe("synthesize with pauses", () => {
  it("records each line on its own and puts silence between them for PCM voices", async () => {
    const synthesize = await load();
    const out = await synthesize({
      key: "k", model: "heygen/heygen-voice-1-turbo", voice: "nadine",
      text: lines.join("\n\n"), lines, pauseMs: 1000, speed: 0.85, compact: true,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(seen).toHaveLength(3);
    expect(seen.map((b) => b.input)).toEqual(lines);
    expect(seen.every((b) => b.speed === 0.85)).toBe(true);
    // 3 x 0.5 s of speech, compacted to 22.05 kHz, plus 2 pauses of 1 s.
    expect(out.audio.byteLength).toBe(44 + 3 * 22050 + 2 * 44100);
    expect(out.speedApplied).toBe(true);
    expect(out.pauseMs).toBe(1000);
    expect(out.starts).toHaveLength(3);
    expect(out.starts![0]).toBe(0);
    expect(out.starts![1]).toBeGreaterThan(out.starts![0]);
  });

  it("asks again without speed when the model refuses it", async () => {
    refuseSpeed = true;
    const synthesize = await load();
    const out = await synthesize({
      key: "k", model: "heygen/heygen-voice-1-turbo", voice: "nadine",
      text: lines.join("\n\n"), lines, pauseMs: 500, speed: 0.8, compact: true,
    });
    refuseSpeed = false;
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.speedApplied).toBe(false);
    // The refused tries are not billed; the lines that went through carry no speed.
    expect(seen.filter((b) => !("speed" in b))).toHaveLength(3);
  });

  it("sends the script in one request, with a blank line between sentences, to MP3 voices", async () => {
    const synthesize = await load();
    const out = await synthesize({
      key: "k", model: "hexgrad/kokoro-82m", voice: "af_heart",
      text: lines.join("\n\n"), lines, pauseMs: 1000, speed: 0.85,
    });
    expect(out.ok && out.mime).toBe("audio/mpeg");
    expect(seen).toHaveLength(1);
    expect(seen[0].input).toBe(lines.join("\n\n"));
    expect(out.ok && out.starts).toBeUndefined();
    // Not normalised: MP3 comes back byte for byte (see #40).
    expect(out.ok && Buffer.from(out.audio).toString()).toBe("ID3");
  });

  it("gives up after a line fails three times", async () => {
    failOn = "Breathe in.";
    const synthesize = await load();
    const many = ["Breathe in.", ...Array.from({ length: 8 }, (_, i) => `Line ${i}.`)];
    const out = await synthesize({
      key: "k", model: "heygen/heygen-voice-1-turbo", voice: "nadine",
      text: many.join("\n\n"), lines: many, pauseMs: 500,
    });
    failOn = null;
    expect(out.ok).toBe(false);
    // The failing line is tried 3 times (2 retries) before the recording gives
    // up. Other lines go on while it is retried, since the retry may succeed;
    // no line is asked for twice except the failing one.
    expect(seen.filter((b) => b.input === "Breathe in.")).toHaveLength(3);
    expect(seen.length).toBeLessThanOrEqual(many.length + 2);
  });

  it("retries a line once the provider has a brief error, and records the whole script", async () => {
    failOn = "You are calm.";
    failTimes = 1;
    const synthesize = await load();
    const out = await synthesize({
      key: "k", model: "heygen/heygen-voice-1-turbo", voice: "nadine",
      text: lines.join("\n\n"), lines, pauseMs: 500,
    });
    failOn = null;
    failTimes = Infinity;
    expect(out.ok).toBe(true);
    expect(seen.filter((b) => b.input === "You are calm.")).toHaveLength(2);
  });

  it("does not retry a refusal (4xx)", async () => {
    failOn = "You are calm.";
    failStatus = 403;
    const synthesize = await load();
    const out = await synthesize({
      key: "k", model: "heygen/heygen-voice-1-turbo", voice: "nadine",
      text: lines.join("\n\n"), lines, pauseMs: 500,
    });
    failOn = null;
    failStatus = 500;
    expect(out.ok).toBe(false);
    expect(seen.filter((b) => b.input === "You are calm.")).toHaveLength(1);
  });

  it("sends no speed when none is asked for", async () => {
    const synthesize = await load();
    await synthesize({ key: "k", model: "hexgrad/kokoro-82m", voice: "af_heart", text: "Hello." });
    expect(seen[0]).not.toHaveProperty("speed");
  });
});

describe("a refrain recorded after the script (#77)", () => {
  it("follows the last line with no pause, and does not count as a gap", async () => {
    const synthesize = await load();
    const withRefrain = [...lines, "The house is yours."];
    const out = await synthesize({
      key: "k", model: "heygen/heygen-voice-1-turbo", voice: "nadine",
      text: "", lines: withRefrain, pauseMs: 1000, compact: true, tail: 1,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // 4 x 0.5 s of speech at 22.05 kHz, and pauses only between the 3 script lines.
    expect(out.audio.byteLength).toBe(44 + 4 * 22050 + 2 * 44100);
    expect(out.starts).toHaveLength(4);
    const total = 4 * 22050 + 2 * 44100;
    expect(out.starts![3]).toBeCloseTo((3 * 22050 + 2 * 44100) / total, 3);
  });
});

describe("atomic voices (#76)", () => {
  it("records the whole script in one request, with a pause written between lines", async () => {
    const synthesize = await load();
    const out = await synthesize({
      key: "k", model: "google/gemini-3.8-flash-lite-tts", voice: "Sulafat",
      text: lines.join("\n\n"), lines, pauseMs: 1500, instructions: "Speak slowly.", compact: true, atomic: true,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(seen).toHaveLength(1);
    expect(seen[0].input).toBe(lines.join(" [pause] "));
    expect(seen[0].instructions).toBe("Speak slowly.");
    expect(out.starts).toHaveLength(3);
    expect(out.starts![0]).toBe(0);
    expect(out.starts![1]).toBeGreaterThan(0);
  });

  it("reports every request sent when the retries run out", async () => {
    failOn = lines.join(" [pause] ");
    const synthesize = await load();
    const out = await synthesize({
      key: "k", model: "google/gemini-3.8-flash-lite-tts", voice: "Sulafat",
      text: "", lines, pauseMs: 1500, atomic: true,
    });
    failOn = null;
    expect(out.ok).toBe(false);
    // The first request and both retries were sent, so all three are counted.
    expect(seen).toHaveLength(3);
    if (!out.ok) expect(out.sentChars).toBe(3 * lines.join(" [pause] ").length);
  });

  it("retries the whole request once the provider has a brief error", async () => {
    failOn = lines.join(" [pause] ");
    failTimes = 1;
    const synthesize = await load();
    const out = await synthesize({
      key: "k", model: "google/gemini-3.8-flash-lite-tts", voice: "Sulafat",
      text: "", lines, pauseMs: 1500, atomic: true,
    });
    failOn = null;
    failTimes = Infinity;
    expect(out.ok).toBe(true);
    expect(seen).toHaveLength(2);
    // Both requests are counted for the ledger, the failed one included.
    if (out.ok) expect(out.sentChars).toBe(2 * lines.join(" [pause] ").length);
  });

  it("records line by line when one piece is too long and its pauses cannot be found", async () => {
    bigOn = lines.join(" [pause] ");
    const synthesize = await load();
    const out = await synthesize({
      key: "k", model: "google/gemini-3.8-flash-lite-tts", voice: "Sulafat",
      text: "", lines, pauseMs: 1500, atomic: true, timeoutMs: 20_000,
    });
    bigOn = null;
    expect(out.ok).toBe(true);
    // One atomic request, then one per line.
    expect(seen.map((b) => b.input)).toEqual([lines.join(" [pause] "), ...lines]);
    // Both takes were billed: the thrown-away one is reported for the ledger.
    if (!out.ok) return;
    expect(out.requests).toBe(lines.length + 1);
    expect(out.sentChars).toBe(lines.join(" [pause] ").length + lines.join("").length);
  });

  it("records a refrain in the same request and puts no pause before it (#77)", async () => {
    voicedAtomic = true;
    const synthesize = await load();
    const withRefrain = [...lines, "The house is yours."];
    const out = await synthesize({
      key: "k", model: "google/gemini-3.8-flash-lite-tts", voice: "Sulafat",
      text: "", lines: withRefrain, pauseMs: 1500, compact: true, atomic: true, tail: 1,
    });
    voicedAtomic = false;
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(seen).toHaveLength(1);
    expect(seen[0].input).toBe(withRefrain.join(" [pause] "));
    expect(out.startsEstimated).toBeFalsy();
    const s = out.starts!;
    expect(s).toHaveLength(4);
    // The gap after the closing is far shorter than the 1.5 s pauses between script lines.
    expect(s[3] - s[2]).toBeLessThan(s[2] - s[1]);
  });

  it("records line by line when a refrain must be cut but the pauses cannot be found", async () => {
    const synthesize = await load();
    const withRefrain = [...lines, "The house is yours."];
    const out = await synthesize({
      key: "k", model: "google/gemini-3.8-flash-lite-tts", voice: "Sulafat",
      text: "", lines: withRefrain, pauseMs: 1500, compact: true, atomic: true, tail: 1,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // The silent atomic take has no pauses to cut at, so the lines are recorded one by one.
    expect(seen.map((b) => b.input)).toEqual([withRefrain.join(" [pause] "), ...withRefrain]);
    expect(out.startsEstimated).toBeFalsy();
    expect(out.starts).toHaveLength(4);
    expect(out.sentChars).toBe(withRefrain.join(" [pause] ").length + withRefrain.join("").length);
  });

  it("keeps the script and leaves the refrain out when there is no time to record line by line", async () => {
    // Speech with the pause after line 1 missing, so the lines cannot all be
    // found, but the pause before the refrain is there to cut in.
    voicedAtomic = true;
    atomicGapsMs = [0, 800, 800];
    atomicDelayMs = 1200;
    const synthesize = await load();
    const withRefrain = [...lines, "The house is yours."];
    const out = await synthesize({
      key: "k", model: "google/gemini-3.8-flash-lite-tts", voice: "Sulafat",
      text: "", lines: withRefrain, pauseMs: 1500, atomic: true, tail: 1, timeoutMs: 2000,
    });
    voicedAtomic = false;
    atomicGapsMs = null;
    atomicDelayMs = 0;
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(seen).toHaveLength(1);
    expect(out.tailDropped).toBe(true);
    expect(out.starts).toHaveLength(3);
    // Cut 120 ms into the pause before the refrain: 3 lines of 0.6 s, one 0.8 s pause.
    const rate = 24000;
    const want = 3 * Math.round(rate * 0.6) + Math.round(rate * 0.8) + Math.round(rate * 0.12);
    expect((out.audio.byteLength - 44) / 2).toBe(want);
  });

  it("fails rather than cut at an estimate when no pause before the refrain can be measured", async () => {
    atomicDelayMs = 1200;
    const synthesize = await load();
    const withRefrain = [...lines, "The house is yours."];
    const out = await synthesize({
      key: "k", model: "google/gemini-3.8-flash-lite-tts", voice: "Sulafat",
      text: "", lines: withRefrain, pauseMs: 1500, atomic: true, tail: 1, timeoutMs: 2000,
    });
    atomicDelayMs = 0;
    expect(out.ok).toBe(false);
    expect(seen).toHaveLength(1);
    if (!out.ok) expect(out.sentChars).toBe(withRefrain.join(" [pause] ").length);
  });

  it("leaves voices without the flag line by line", async () => {
    const synthesize = await load();
    await synthesize({ key: "k", model: "google/gemini-3.8-flash-lite-tts", voice: "Sulafat", text: "", lines, pauseMs: 1500 });
    expect(seen).toHaveLength(3);
  });
});
