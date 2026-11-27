// Runs POST /api/rerecord against a stand-in for OpenRouter on localhost.
// No real key, no network.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import limits from "@/config/limits.json";

vi.mock("server-only", () => ({}));

type Call = { path: string; body: unknown };
let calls: Call[] = [];
let usage = 0;
let vetReply = "OK";
let speechFails = false;
let server: Server;
let POST: (req: Request) => Promise<Response>;
let L: typeof import("@/lib/server/ledger");
let webhookHits: unknown[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const path = req.url ?? "";
      if (path.startsWith("/hook")) {
        webhookHits.push(JSON.parse(raw));
        return res.end("{}");
      }
      calls.push({ path, body: raw ? JSON.parse(raw) : null });
      res.setHeader("Content-Type", "application/json");
      if (path.startsWith("/key")) return res.end(JSON.stringify({ data: { usage, limit_remaining: null } }));
      if (path.startsWith("/models")) return res.end(JSON.stringify({ data: [{ id: "google/gemini-2.5-flash-lite" }] }));
      if (path.startsWith("/chat/completions")) {
        const content = vetReply === "<empty>" ? null : vetReply;
        return res.end(JSON.stringify({ choices: [{ message: { content } }], usage: { cost: 0.00002 } }));
      }
      if (path.startsWith("/audio/speech") && speechFails) {
        res.statusCode = 500;
        return res.end("{}");
      }
      if (path.startsWith("/audio/speech")) {
        res.setHeader("Content-Type", "audio/pcm;rate=24000");
        return res.end(Buffer.alloc(480));
      }
      res.statusCode = 404;
      res.end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${addr.port}`;
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.ALERT_WEBHOOK_URL = `http://127.0.0.1:${addr.port}/hook`;
  ({ POST } = await import("@/app/api/rerecord/route"));
  L = await import("@/lib/server/ledger");
});

afterAll(() => {
  server.close();
  delete process.env.OPENROUTER_BASE_URL;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.ALERT_WEBHOOK_URL;
});

beforeEach(() => {
  calls = [];
  usage = 0;
  vetReply = "OK";
  webhookHits = [];
  speechFails = false;
  delete process.env.SPEECH_ENABLED;
  L.setLedger(new L.MemoryLedger());
  L.resetAlerts();
});

let ipN = 0;
const req = (body: unknown) =>
  new Request("http://localhost/api/rerecord", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": `10.0.0.${++ipN}` },
    body: JSON.stringify(body),
  });
const script = { lines: ["Take a slow breath.", "You are calm and steady."], voiceId: null };
const paths = () => calls.map((c) => c.path.split("?")[0]);

describe("POST /api/rerecord", () => {
  it("vets the script, then records exactly those words", async () => {
    const res = await POST(req(script));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^audio\//);
    expect(paths()).toContain("/chat/completions");
    const speech = calls.find((c) => c.path.startsWith("/audio/speech"));
    // The default voice is atomic: one request, a pause marker between lines.
    expect(calls.filter((c) => c.path.startsWith("/audio/speech"))).toHaveLength(1);
    expect((speech?.body as { input: string }).input).toBe("Take a slow breath. [pause] You are calm and steady.");
    // Same delivery as /api/manifest at the default pace and tone.
    const D = await import("@/lib/delivery");
    const pace = D.resolvePace(undefined);
    const tone = D.resolveTone(undefined);
    expect(speech?.body).toMatchObject({ speed: D.speedFor(pace, tone), instructions: D.styleInstruction(pace, tone) });
  });

  it("records a non-atomic PCM voice (HeyGen) line-by-line so pauses can be stitched", async () => {
    // HeyGen is a PCM voice: synthesize stitches lines with silence gaps when lines+pauseMs are passed.
    const res = await POST(req({ ...script, voiceId: "heygen-nadine" }));
    expect(res.status).toBe(200);
    const speechCalls = calls.filter((c) => c.path.startsWith("/audio/speech"));
    // Each line goes in its own request so PCM silence can be inserted between them.
    expect(speechCalls).toHaveLength(2);
    expect((speechCalls[0]?.body as { input: string }).input).toBe("Take a slow breath.");
    expect((speechCalls[1]?.body as { input: string }).input).toBe("You are calm and steady.");
  });

  it("applies the speedStep to a non-atomic voice re-record (web library fix)", async () => {
    const res = await POST(req({ ...script, voiceId: "heygen-nadine", speedStep: "faster" }));
    expect(res.status).toBe(200);
    const speechCalls = calls.filter((c) => c.path.startsWith("/audio/speech"));
    const V = await import("@/lib/voice/options");
    const faster = V.SPEED_OPTIONS.find((o) => o.id === "faster")!;
    expect((speechCalls[0]?.body as { speed: number }).speed).toBe(faster.speed);
  });

  it("applies cadenceStep to a non-atomic PCM voice re-record so silence gaps use the right pauseMs", async () => {
    // With cadenceStep, synthesize receives the resolved pauseMs and stitches that many ms of silence.
    const res = await POST(req({ ...script, voiceId: "heygen-nadine", cadenceStep: "long" }));
    expect(res.status).toBe(200);
    const speechCalls = calls.filter((c) => c.path.startsWith("/audio/speech"));
    // HeyGen stitches: one request per line.
    expect(speechCalls).toHaveLength(2);
    expect((speechCalls[0]?.body as { input: string }).input).toBe("Take a slow breath.");
    expect((speechCalls[1]?.body as { input: string }).input).toBe("You are calm and steady.");
  });

  it("records nothing when the model says no", async () => {
    vetReply = "NO";
    const res = await POST(req(script));
    expect(res.status).toBe(422);
    expect(paths()).not.toContain("/audio/speech");
  });

  it("records nothing at the spend ceiling, and does not ask the text model", async () => {
    usage = limits.spendCeilingUsd * 2.5;
    const res = await POST(req(script));
    expect(res.status).toBe(429);
    expect(paths()).not.toContain("/chat/completions");
    expect(paths()).not.toContain("/audio/speech");
  });

  it("is off when the kill switch is set", async () => {
    process.env.SPEECH_ENABLED = "false";
    const res = await POST(req(script));
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it("refuses an over-long script before any paid call", async () => {
    const res = await POST(req({ lines: ["a".repeat(limits.maxScriptChars + 1)] }));
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("records the vet and the speech call in the ledger", async () => {
    await POST(req(script));
    const rows = await L.ledger().recent(10);
    expect(rows.map((r) => r.kind)).toEqual(["speech", "vet"]);
    expect(rows[1]).toMatchObject({ route: "rerecord", model: "google/gemini-2.5-flash-lite", estUsd: 0.00002 });
    // The default voice is atomic: the ledger counts the pause tags sent with the lines.
    expect(rows[0].chars).toBe("Take a slow breath. [pause] You are calm and steady.".length);
  });

  it("records a rejected vet (it was paid for) but no speech", async () => {
    vetReply = "NO";
    await POST(req(script));
    expect((await L.ledger().recent(10)).map((r) => r.kind)).toEqual(["vet"]);
  });

  it("alerts once at 50%, again at 80%, and at 100% when recording stops", async () => {
    usage = limits.spendCeilingUsd * 0.55;
    await POST(req(script));
    await POST(req(script));
    usage = limits.spendCeilingUsd * 0.85;
    await POST(req(script));
    usage = limits.spendCeilingUsd * 1.25;
    const res = await POST(req(script));
    expect(res.status).toBe(429);
    // Webhooks are sent in the background, so wait for them.
    await vi.waitFor(() => expect(webhookHits).toHaveLength(3));
    expect(webhookHits.map((h) => (h as { level: number }).level).sort((a, b) => a - b)).toEqual([50, 80, 100]);
    expect(webhookHits.some((h) => (h as { text: string }).text.includes("Recording has stopped"))).toBe(true);
  });

  it("counts rejected scripts against the visitor's daily slots", async () => {
    vetReply = "NO";
    const from = (ip: string) =>
      new Request("http://localhost/api/rerecord", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-real-ip": ip },
        body: JSON.stringify(script),
      });
    for (let i = 0; i < limits.perIpPerDay; i++) expect((await POST(from("10.9.9.9"))).status).toBe(422);
    calls = [];
    expect((await POST(from("10.9.9.9"))).status).toBe(429);
    expect(paths()).not.toContain("/chat/completions");
  });

  it("records a failed recording as unpriced and not ok", async () => {
    speechFails = true;
    expect((await POST(req(script))).status).toBe(502);
    const rows = await L.ledger().recent(10);
    expect(rows[0]).toMatchObject({ kind: "speech", ok: false, estUsd: null });
  });

  it("records a check that answered with nothing usable, keeps the slot, and records no speech", async () => {
    vetReply = "<empty>";
    expect((await POST(req(script))).status).toBe(503);
    const rows = await L.ledger().recent(10);
    expect(rows.map((r) => r.kind)).toEqual(["vet"]);
    expect(rows[0].estUsd).toBe(0.00002);
  });
});
