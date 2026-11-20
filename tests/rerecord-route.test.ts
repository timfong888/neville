// Runs POST /api/rerecord against a stand-in for OpenRouter on localhost.
// No real key, no network.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Call = { path: string; body: unknown };
let calls: Call[] = [];
let usage = 0;
let vetReply = "OK";
let server: Server;
let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const path = req.url ?? "";
      calls.push({ path, body: raw ? JSON.parse(raw) : null });
      res.setHeader("Content-Type", "application/json");
      if (path.startsWith("/key")) return res.end(JSON.stringify({ data: { usage, limit_remaining: null } }));
      if (path.startsWith("/models")) return res.end(JSON.stringify({ data: [{ id: "google/gemini-2.5-flash-lite" }] }));
      if (path.startsWith("/chat/completions")) {
        return res.end(JSON.stringify({ choices: [{ message: { content: vetReply } }] }));
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
  ({ POST } = await import("@/app/api/rerecord/route"));
});

afterAll(() => {
  server.close();
  delete process.env.OPENROUTER_BASE_URL;
  delete process.env.OPENROUTER_API_KEY;
});

beforeEach(() => {
  calls = [];
  usage = 0;
  vetReply = "OK";
  delete process.env.SPEECH_ENABLED;
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
    expect((speech?.body as { input: string }).input).toBe("Take a slow breath. You are calm and steady.");
  });

  it("records nothing when the model says no", async () => {
    vetReply = "NO";
    const res = await POST(req(script));
    expect(res.status).toBe(422);
    expect(paths()).not.toContain("/audio/speech");
  });

  it("records nothing at the spend ceiling, and does not ask the text model", async () => {
    usage = 5;
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
    const res = await POST(req({ lines: ["a".repeat(800)] }));
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("counts rejected scripts against the visitor's daily slots", async () => {
    vetReply = "NO";
    const from = (ip: string) =>
      new Request("http://localhost/api/rerecord", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-real-ip": ip },
        body: JSON.stringify(script),
      });
    for (let i = 0; i < 6; i++) expect((await POST(from("10.9.9.9"))).status).toBe(422);
    calls = [];
    expect((await POST(from("10.9.9.9"))).status).toBe(429);
    expect(paths()).not.toContain("/chat/completions");
  });
});
