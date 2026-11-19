import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// A stand-in for OpenRouter on this machine: no network, no spend.
vi.mock("server-only", () => ({}));

let server: Server;
const seen: Array<Record<string, unknown>> = [];
let refuseSpeed = false;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw);
      seen.push(body);
      if (refuseSpeed && "speed" in body) {
        res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: { message: "unknown field speed" } }));
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

const lines = ["Breathe in.", "You are calm.", "And so it is."];

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
  });

  it("sends no speed when none is asked for", async () => {
    const synthesize = await load();
    await synthesize({ key: "k", model: "hexgrad/kokoro-82m", voice: "af_heart", text: "Hello." });
    expect(seen[0]).not.toHaveProperty("speed");
  });
});
