// Regression tests for the adult-tier script model fallback.
// When writeAdultScript returns no_model, the manifest route falls through
// to the standard writeScript path rather than returning 422 content_policy.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import limits from "@/config/limits.json";

vi.mock("server-only", () => ({}));

// ── 1. Config: adult script models are configured ─────────────────────────────

describe("config/limits.json adultScriptModels", () => {
  it("is non-empty — PR regression: nothingiisreal/mn-celeste-12b was removed from catalog", () => {
    const configured = (limits as unknown as { adultScriptModels?: string[] }).adultScriptModels ?? [];
    expect(configured.length).toBeGreaterThan(0);
  });

  it("every entry is a non-empty string containing a slash (provider/model format)", () => {
    const configured = (limits as unknown as { adultScriptModels?: string[] }).adultScriptModels ?? [];
    for (const id of configured) {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
      expect(id).toContain("/");
    }
  });
});

// ── 2. Route: fallback and gate behavior ─────────────────────────────────────
// The manifest route is wired with a local HTTP stand-in for TTS/models and
// vi.mock stubs for auth and paywall so the test stays fast and offline.

let server: Server;
let POST: (req: Request) => Promise<Response>;
let writeAdultScriptResult: { ok: false; reason: "no_model" | "output_gate"; category?: string } | { ok: true; lines: string[]; refrain: string; source: string };
let writeScriptCalled = false;

vi.mock("@/lib/server/writer", () => ({
  writeScript: async () => {
    writeScriptCalled = true;
    return { lines: ["You are enough."], refrain: "You are enough.", source: "model", model: "m", costUsd: 0.001 };
  },
  writeAdultScript: async () => writeAdultScriptResult,
  scriptModels: async () => ["m"],
  adultScriptModels: async () => ["sao10k/l3.1-euryale-70b"],
}));

vi.mock("@/lib/server/vet", () => ({
  vetScript: async () => ({ ok: true, model: "v", costUsd: 0 }),
}));

vi.mock("@/lib/server/ledger", () => ({
  record: async () => undefined,
  estimateSpeech: async () => 0,
}));

vi.mock("@/lib/server/alertFailure", () => ({
  alertFailure: () => undefined,
}));

vi.mock("@/lib/server/telemetry", () => ({
  captureEvent: () => undefined,
}));

vi.mock("@/lib/server/accounts", () => ({
  currentUser: async () => ({ id: "u1", email: "adult@test.com", emailVerified: true }),
}));

vi.mock("@/lib/server/paywall", () => ({
  runPaid: (fn: (s: { deadlineAt?: number }) => Promise<Response>) => fn({ deadlineAt: Date.now() + 60_000 }),
  charge: async () => ({ left: null, refund: async () => {}, fulfil: async () => {} }),
  whoIsAsking: async () => ({ email: "adult@test.com" }),
  timeoutResponse: () => new Response("timeout", { status: 503 }),
  timeoutAnswer: () => new Response("timeout", { status: 503 }),
  voiceBudget: (_: unknown, ms: number) => ms,
  paywallEnabled: () => false,
}));

vi.mock("@/lib/server/limits", () => ({
  LIMITS: {
    maxWantChars: 280,
    maxScriptChars: 800,
    adultTtsFallback: [],
    nameEveryWords: 50, nameMin: 5, nameMax: 8, minGapWords: 10,
  },
  generationEnabled: () => true,
  takeSlot: async () => null,
  underCeiling: async () => ({ ok: true, usage: 0 }),
}));

vi.mock("@/lib/credits", () => ({
  isFilterRelaxed: () => false,
  isUnlimited: () => false,
  paywallEnabled: () => false,
}));

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url?.startsWith("/models")) return res.end(JSON.stringify({ data: [{ id: "sao10k/l3.1-euryale-70b" }] }));
    if (req.url?.startsWith("/audio/speech")) {
      res.setHeader("Content-Type", "audio/pcm;rate=24000");
      return res.end(Buffer.alloc(480));
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address() as { port: number };
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${addr.port}`;
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.ADULT_TIER_ENABLED = "true";
  process.env.ADULT_TIER_EMAILS = "adult@test.com";
  ({ POST } = await import("@/app/api/manifest/route"));
});

afterAll(() => {
  server.close();
  delete process.env.OPENROUTER_BASE_URL;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.ADULT_TIER_ENABLED;
  delete process.env.ADULT_TIER_EMAILS;
});

beforeEach(() => {
  writeScriptCalled = false;
  writeAdultScriptResult = { ok: true, lines: ["OK"], refrain: "OK", source: "model" };
});

const req = () =>
  new Request("http://localhost/api/manifest", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": "1.2.3.5" },
    body: JSON.stringify({ want: "Tim, you are enough", name: "Tim" }),
  });

describe("POST /api/manifest — adult-tier script model fallback", () => {
  it("no_model falls through to standard writeScript and returns 200", async () => {
    writeAdultScriptResult = { ok: false, reason: "no_model" };
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(writeScriptCalled).toBe(true);
  });

  it("output_gate still refuses with 422 content_policy, does not fall through", async () => {
    writeAdultScriptResult = { ok: false, reason: "output_gate", category: "violence" };
    const res = await POST(req());
    expect(res.status).toBe(422);
    const j = await res.json() as { code: string };
    expect(j.code).toBe("content_policy");
    expect(writeScriptCalled).toBe(false);
  });

  it("no_model and output_gate return different HTTP status codes", async () => {
    writeAdultScriptResult = { ok: false, reason: "no_model" };
    const noModelStatus = (await POST(req())).status;

    writeAdultScriptResult = { ok: false, reason: "output_gate" };
    const outputGateStatus = (await POST(req())).status;

    expect(noModelStatus).not.toBe(outputGateStatus);
    expect(noModelStatus).toBe(200);
    expect(outputGateStatus).toBe(422);
  });
});
