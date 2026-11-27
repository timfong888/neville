// Tests for GET /api/dev/tts-bench.
// No real network; uses a local HTTP server as a stand-in for OpenRouter.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// --- module-level state shared by vi.mock factories ---
let benchUser: { id: string; name: string; email: string; image: null; emailVerified: boolean } | null = null;
let unlimitedOverride: boolean | null = null;
let serverFails = false;

vi.mock("@/lib/server/accounts", () => ({
  accountsEnabled: () => true,
  currentUser: async () => benchUser,
}));

vi.mock("@/lib/credits", () => ({
  isUnlimited: () => (unlimitedOverride !== null ? unlimitedOverride : benchUser !== null),
}));

// --- local stand-in for OpenRouter ---
let server: Server;
let servedModels: Array<{ id: string; voices: string[]; pricing: Record<string, string> }> = [];
let speechCalls: Array<{ model: string; voice?: string }> = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    if (serverFails) {
      res.writeHead(500).end("{}");
      return;
    }
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = req.url ?? "";
      if (url.includes("/models")) {
        const data = servedModels.map((m) => ({
          id: m.id,
          name: m.id,
          pricing: m.pricing,
          supported_voices: m.voices,
        }));
        return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ data }));
      }
      if (url.includes("/audio/speech")) {
        const body = raw ? (JSON.parse(raw) as { model: string; voice?: string }) : { model: "" };
        speechCalls.push({ model: body.model, voice: body.voice });
        return res.writeHead(200, { "Content-Type": "audio/mpeg" }).end(Buffer.from("ID3"));
      }
      res.writeHead(404).end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.OPENROUTER_API_KEY = "test-key";
});

afterAll(() => {
  server.close();
  delete process.env.OPENROUTER_BASE_URL;
  delete process.env.OPENROUTER_API_KEY;
});

afterEach(() => {
  speechCalls = [];
  serverFails = false;
  unlimitedOverride = null;
});

// Fresh import every test so env reads pick up current state.
async function load() {
  vi.resetModules();
  return (await import("@/app/api/dev/tts-bench/route")).GET;
}

function req() {
  return new Request("https://neville.test/api/dev/tts-bench");
}

describe("GET /api/dev/tts-bench gate", () => {
  it("returns 404 when TTS_BENCH is not set", async () => {
    delete process.env.TTS_BENCH;
    benchUser = { id: "u1", name: "Tim", email: "tim@example.com", image: null, emailVerified: true };
    unlimitedOverride = true;
    const GET = await load();
    const res = await GET(req());
    expect(res.status).toBe(404);
  });

  it("returns 404 when TTS_BENCH is 0 (not '1')", async () => {
    process.env.TTS_BENCH = "0";
    benchUser = { id: "u1", name: "Tim", email: "tim@example.com", image: null, emailVerified: true };
    unlimitedOverride = true;
    const GET = await load();
    const res = await GET(req());
    expect(res.status).toBe(404);
    delete process.env.TTS_BENCH;
  });

  it("returns 404 when user is not signed in", async () => {
    process.env.TTS_BENCH = "1";
    benchUser = null;
    unlimitedOverride = false;
    const GET = await load();
    const res = await GET(req());
    expect(res.status).toBe(404);
    delete process.env.TTS_BENCH;
  });

  it("returns 404 when user is signed in but not on the unlimited (tester) tier", async () => {
    process.env.TTS_BENCH = "1";
    benchUser = { id: "u2", name: "Regular", email: "user@example.com", image: null, emailVerified: true };
    unlimitedOverride = false;
    const GET = await load();
    const res = await GET(req());
    expect(res.status).toBe(404);
    delete process.env.TTS_BENCH;
  });
});

describe("GET /api/dev/tts-bench results", () => {
  it("calls each model and returns per-model results", async () => {
    servedModels = [
      { id: "model-a", voices: ["voice-1", "voice-2"], pricing: { prompt: "0.000015" } },
      { id: "model-b", voices: [], pricing: {} },
    ];
    process.env.TTS_BENCH = "1";
    benchUser = { id: "u1", name: "Tim", email: "tim@example.com", image: null, emailVerified: true };
    unlimitedOverride = true;
    const GET = await load();
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { results: Array<{ model: string; voice: string; outcome: string; bytes: number }> };
    expect(json.results).toHaveLength(2);
    expect(json.results[0].model).toBe("model-a");
    expect(json.results[0].voice).toBe("voice-1");
    expect(json.results[0].outcome).toBe("ok");
    expect(json.results[0].bytes).toBeGreaterThan(0);
    expect(json.results[1].model).toBe("model-b");
    expect(json.results[1].voice).toBe("");
    // Both models were called.
    expect(speechCalls).toHaveLength(2);
    delete process.env.TTS_BENCH;
  });

  it("stops and sets cappedAt when total estimated cost reaches $1", async () => {
    // Each model costs ~$0.60; two would exceed $1 so second should be skipped.
    // TEST_LINE is ~93 chars; usdPerMChars = pricing.prompt * 1e6 when no completion price.
    // For cost >= $1 we need usdPerMChars such that 93 chars costs >= $1.
    // usdPerMChars = 1e6 / 93 ≈ 10752; pricing.prompt = usdPerMChars / 1e6 ≈ 0.010752.
    const expensivePerMChars = 1_000_000 / 90; // just above $1 for ~90 chars
    const pricingPrompt = String(expensivePerMChars / 1_000_000);
    servedModels = [
      { id: "costly-a", voices: ["v1"], pricing: { prompt: pricingPrompt } },
      { id: "costly-b", voices: ["v1"], pricing: { prompt: pricingPrompt } },
    ];
    process.env.TTS_BENCH = "1";
    benchUser = { id: "u1", name: "Tim", email: "tim@example.com", image: null, emailVerified: true };
    unlimitedOverride = true;
    const GET = await load();
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { results: unknown[]; totalCostUsd: number; cappedAt: number };
    // Only the first model ran; second was skipped because cost >= $1.
    expect(json.results).toHaveLength(1);
    expect(speechCalls).toHaveLength(1);
    expect(json.cappedAt).toBe(1.0);
    expect(json.totalCostUsd).toBeGreaterThanOrEqual(1.0);
    delete process.env.TTS_BENCH;
  });

  it("records refused (4xx) and error outcomes", async () => {
    servedModels = [{ id: "refuse-model", voices: ["v1"], pricing: {} }];
    // Override the speech handler to return 422 for this test.
    const origHandler = server.listeners("request")[0] as Parameters<Server["on"]>[1];
    server.removeListener("request", origHandler);
    const refuseHandler = (_req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => {
      let raw = "";
      _req.on("data", (c) => (raw += c));
      _req.on("end", () => {
        const url = _req.url ?? "";
        if (url.includes("/models")) {
          const data = servedModels.map((m) => ({
            id: m.id, name: m.id, pricing: m.pricing, supported_voices: m.voices,
          }));
          return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ data }));
        }
        if (url.includes("/audio/speech")) {
          return res.writeHead(422, { "Content-Type": "application/json" }).end(JSON.stringify({ error: { message: "content policy" } }));
        }
        res.writeHead(404).end("{}");
      });
    };
    server.on("request", refuseHandler);

    process.env.TTS_BENCH = "1";
    benchUser = { id: "u1", name: "Tim", email: "tim@example.com", image: null, emailVerified: true };
    unlimitedOverride = true;
    const GET = await load();
    const res = await GET(req());
    const json = (await res.json()) as { results: Array<{ outcome: string; httpStatus: number }> };
    expect(json.results[0].outcome).toBe("refused");
    expect(json.results[0].httpStatus).toBe(422);

    // Restore original handler.
    server.removeListener("request", refuseHandler);
    server.on("request", origHandler);
    delete process.env.TTS_BENCH;
  });
});
