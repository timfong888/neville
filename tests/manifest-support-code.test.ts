// Regression tests for issue #281: support code on failure, audio timeout returns written script.
// Tests the manifest route's response shape on failure paths.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ── writer: stable good script; writeAdultScript result is controlled per-test ─
type AdultResult = { ok: false; reason: "no_model" | "output_gate"; category?: string } | { ok: true; script: { lines: string[]; refrain: string; source: string; model: string; costUsd: number } };
let adultResult: AdultResult = { ok: false, reason: "no_model" };

vi.mock("@/lib/server/writer", () => ({
  writeScript: async () => ({
    lines: ["You are enough.", "You are whole.", "You are present.", "You are calm.", "You are strong.",
            "You are loved.", "You are free.", "You are here now."],
    refrain: "You are enough.",
    source: "model",
    model: "test-model",
    costUsd: 0.001,
  }),
  writeAdultScript: async () => adultResult,
  scriptModels: async () => ["test-model"],
  adultScriptModels: async () => ["adult-model"],
}));

vi.mock("@/lib/server/vet", () => ({ vetScript: async () => ({ ok: true, model: "v", costUsd: 0 }) }));
vi.mock("@/lib/server/ledger", () => ({ record: async () => undefined, estimateSpeech: async () => 0 }));
vi.mock("@/lib/server/alertFailure", () => ({ alertFailure: () => undefined }));
vi.mock("@/lib/server/telemetry", () => ({ captureEvent: () => undefined }));

vi.mock("@/lib/server/accounts", () => ({
  currentUser: async () => ({ id: "u1", email: "user@test.com", emailVerified: true }),
}));

vi.mock("@/lib/server/paywall", () => ({
  runPaid: (fn: (s: { deadlineAt?: number }) => Promise<Response>) => fn({ deadlineAt: Date.now() + 60_000 }),
  charge: async () => ({ left: null, refund: async () => {}, fulfil: async () => {} }),
  whoIsAsking: async () => ({ email: "user@test.com" }),
  timeoutResponse: () => new Response("timeout", { status: 503 }),
  timeoutAnswer: () => new Response("timeout", { status: 503 }),
  voiceBudget: (_: unknown, ms: number) => ms,
  paywallEnabled: () => false,
}));

vi.mock("@/lib/server/limits", () => ({
  LIMITS: {
    maxWantChars: 280,
    maxScriptChars: 800,
    // No fallback voices for standard path in this test.
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

// ── test HTTP server: controls audio outcome ───────────────────────────────────

type AudioMode = "ok" | "fail500" | "hang";
let audioMode: AudioMode = "ok";

let server: Server;
let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url?.startsWith("/models")) {
      return res.end(JSON.stringify({ data: [{ id: "test-model" }] }));
    }
    if (req.url?.startsWith("/audio/speech")) {
      if (audioMode === "ok") {
        res.setHeader("Content-Type", "audio/pcm;rate=24000");
        return res.end(Buffer.alloc(480));
      }
      if (audioMode === "fail500") {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: { message: "provider error" } }));
      }
      // "hang": never respond — the AbortSignal will fire
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address() as { port: number };
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${addr.port}`;
  process.env.OPENROUTER_API_KEY = "test-key";
  ({ POST } = await import("@/app/api/manifest/route"));
});

afterAll(() => {
  server.close();
  delete process.env.OPENROUTER_BASE_URL;
  delete process.env.OPENROUTER_API_KEY;
});

beforeEach(() => {
  audioMode = "ok";
  adultResult = { ok: false, reason: "no_model" };
});

const req = () =>
  new Request("http://localhost/api/manifest", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": "1.2.3.4" },
    body: JSON.stringify({ want: "I am calm and confident today", name: "Tim" }),
  });

// ── success baseline ──────────────────────────────────────────────────────────

describe("POST /api/manifest — baseline", () => {
  it("returns 200 on success", async () => {
    audioMode = "ok";
    const res = await POST(req());
    expect(res.status).toBe(200);
  });
});

// ── audio failure returns script + supportCode (#281 F4, F1) ──────────────────

describe("POST /api/manifest — #281 audio failure returns written script and supportCode", () => {
  it("returns 502 with the model's script lines when audio fails", async () => {
    audioMode = "fail500";
    const res = await POST(req());
    expect(res.status).toBe(502);
    const j = await res.json() as { code: string; lines?: string[]; supportCode?: string };
    expect(j.code).toBe("voice_failed");
    // The model's script lines must be present (not null/absent).
    expect(Array.isArray(j.lines)).toBe(true);
    expect((j.lines ?? []).length).toBeGreaterThan(0);
  });

  it("returns supportCode in body when audio fails", async () => {
    audioMode = "fail500";
    const res = await POST(req());
    const j = await res.json() as { supportCode?: string };
    expect(typeof j.supportCode).toBe("string");
    expect(j.supportCode!.length).toBe(8);
  });

  it("supportCode in body equals X-Support-Code header", async () => {
    audioMode = "fail500";
    const res = await POST(req());
    const j = await res.json() as { supportCode?: string };
    const header = res.headers.get("X-Support-Code");
    expect(j.supportCode).toBeDefined();
    expect(j.supportCode).toBe(header);
  });

  it("X-Attempt-Id header present on voice_failed response", async () => {
    audioMode = "fail500";
    const res = await POST(req());
    const header = res.headers.get("X-Attempt-Id");
    expect(typeof header).toBe("string");
    expect(header!.length).toBeGreaterThan(4);
  });

  it("supportCode equals first 8 hex chars of X-Attempt-Id", async () => {
    audioMode = "fail500";
    const res = await POST(req());
    const j = await res.json() as { supportCode?: string };
    const attemptId = res.headers.get("X-Attempt-Id") ?? "";
    const expected = attemptId.replace(/-/g, "").slice(0, 8);
    expect(j.supportCode).toBe(expected);
  });
});

// ── supportCode on content_policy path (#281 F1) ──────────────────────────────

describe("POST /api/manifest — #281 supportCode on adult output_gate path", () => {
  beforeEach(() => {
    process.env.ADULT_TIER_ENABLED = "true";
    process.env.ADULT_TIER_EMAILS = "user@test.com";
  });

  afterAll(() => {
    delete process.env.ADULT_TIER_ENABLED;
    delete process.env.ADULT_TIER_EMAILS;
  });

  it("content_policy response includes supportCode when adult output_gate fires", async () => {
    adultResult = { ok: false, reason: "output_gate", category: "violence" };
    const adultReq = new Request("http://localhost/api/manifest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": "1.2.3.5" },
      body: JSON.stringify({ want: "I am calm", name: "Tim" }),
    });
    const res = await POST(adultReq);
    expect(res.status).toBe(422);
    const j = await res.json() as { code: string; supportCode?: string };
    expect(j.code).toBe("content_policy");
    expect(typeof j.supportCode).toBe("string");
    expect(j.supportCode!.length).toBe(8);
  });

  it("X-Attempt-Id and X-Support-Code headers present on output_gate 422", async () => {
    adultResult = { ok: false, reason: "output_gate", category: "explicit" };
    const adultReq = new Request("http://localhost/api/manifest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": "1.2.3.6" },
      body: JSON.stringify({ want: "I am calm", name: "Tim" }),
    });
    const res = await POST(adultReq);
    expect(res.headers.get("X-Attempt-Id")).toBeTruthy();
    expect(res.headers.get("X-Support-Code")).toBeTruthy();
    const j = await res.json() as { supportCode?: string };
    expect(j.supportCode).toBe(res.headers.get("X-Support-Code"));
  });
});
