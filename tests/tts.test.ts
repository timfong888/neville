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

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw);
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
  });

  it("leaves voices without the flag line by line", async () => {
    const synthesize = await load();
    await synthesize({ key: "k", model: "google/gemini-3.8-flash-lite-tts", voice: "Sulafat", text: "", lines, pauseMs: 1500 });
    expect(seen).toHaveLength(3);
  });
});
