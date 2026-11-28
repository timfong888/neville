// P2 remainder tests for issue #292.
// Verifies:
//   - Every non-200 response (including early refusals) carries attemptId and supportCode.
//   - Every [ledger] log line carries attempt_id.
//   - standardTtsFallback is separate from adultTtsFallback.
import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/vet", () => ({ vetScript: async () => ({ ok: true, model: "v", costUsd: 0 }) }));
vi.mock("@/lib/server/telemetry", () => ({ captureEvent: () => undefined }));
vi.mock("@/lib/server/alertFailure", () => ({ alertFailure: () => undefined }));

vi.mock("@/lib/server/accounts", () => ({
  currentUser: async () => ({ id: "u1", email: "user@test.com", emailVerified: true }),
}));

vi.mock("@/lib/server/paywall", () => ({
  runPaid: (fn: (s: { deadlineAt?: number }) => Promise<Response>) => fn({ deadlineAt: Date.now() + 60_000 }),
  charge: async () => ({ left: null, refund: async () => {}, fulfil: async () => {} }),
  whoIsAsking: async () => ({ email: "user@test.com" }),
  timeoutResponse: () => new Response(JSON.stringify({ code: "timeout" }), { status: 503, headers: { "Content-Type": "application/json" } }),
  timeoutAnswer: async () => new Response(JSON.stringify({ code: "timeout" }), { status: 503, headers: { "Content-Type": "application/json" } }),
  voiceBudget: (_: unknown, ms: number) => ms,
  paywallEnabled: () => false,
}));

vi.mock("@/lib/credits", () => ({
  isFilterRelaxed: () => false,
  isUnlimited: () => false,
  paywallEnabled: () => false,
}));

type AudioMode = "ok" | "fail500";
let audioMode: AudioMode = "ok";
let server: Server;
let POST: (req: Request) => Promise<Response>;
let L: typeof import("@/lib/server/ledger");
let generationOn = true;
let apiKeyPresent = true;

vi.mock("@/lib/server/limits", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/lib/server/limits");
  return {
    ...actual,
    LIMITS: {
      ...actual.LIMITS,
      maxWantChars: 280,
      adultTtsFallback: [{ id: "adult-fb", model: "adult/model", voice: "adult-voice", atomic: false }],
      standardTtsFallback: [{ id: "standard-fb", model: "standard/model", voice: "standard-voice", atomic: false }],
    },
    generationEnabled: () => generationOn,
    takeSlot: async () => null,
    underCeiling: async () => ({ ok: true, usage: 0 }),
  };
});

vi.mock("@/lib/server/writer", () => ({
  writeScript: async () => ({
    lines: ["You are enough.", "You are whole.", "You are present.", "You are calm.", "You are strong.",
            "You are loved.", "You are free.", "You are here now."],
    refrain: "You are enough.",
    source: "model",
    model: "test-model",
    costUsd: 0.001,
  }),
  writeAdultScript: async () => ({ ok: false, reason: "no_model" }),
  scriptModels: async () => ["test-model"],
  adultScriptModels: async () => ["adult-model"],
}));

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url?.startsWith("/models")) return res.end(JSON.stringify({ data: [{ id: "test-model" }] }));
    if (req.url?.startsWith("/audio/speech")) {
      if (audioMode === "ok") {
        res.setHeader("Content-Type", "audio/pcm;rate=24000");
        return res.end(Buffer.alloc(480));
      }
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: "fail" }));
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address() as { port: number };
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${addr.port}`;
  process.env.OPENROUTER_API_KEY = "test-key";
  ({ POST } = await import("@/app/api/manifest/route"));
  L = await import("@/lib/server/ledger");
});

afterAll(() => {
  server.close();
  delete process.env.OPENROUTER_BASE_URL;
  delete process.env.OPENROUTER_API_KEY;
});

beforeEach(() => {
  audioMode = "ok";
  generationOn = true;
  apiKeyPresent = true;
  L.setLedger(new L.MemoryLedger());
});

const baseReq = (overrides: HeadersInit = {}) =>
  new Request("http://localhost/api/manifest", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": "1.2.3.4", "X-Attempt-Id": "fixed-id-00000001", ...overrides },
    body: JSON.stringify({ want: "I am calm and confident today", name: "Alex" }),
  });

// ── 503 on generation disabled ───────────────────────────────────────────────

describe("#292 P2 — 503 generationDisabled carries attemptId", () => {
  it("replies with attemptId and supportCode when generation is off", async () => {
    generationOn = false;
    const res = await POST(baseReq());
    expect(res.status).toBe(503);
    const j = await res.json() as Record<string, unknown>;
    expect(j.attemptId).toBe("fixed-id-00000001");
    expect(typeof j.supportCode).toBe("string");
    expect(res.headers.get("X-Attempt-Id")).toBe("fixed-id-00000001");
  });
});

// ── 400 bad_request carries attemptId ────────────────────────────────────────

describe("#292 P2 — 400 bad_request carries attemptId", () => {
  it("empty want returns 400 with attemptId", async () => {
    const res = await POST(new Request("http://localhost/api/manifest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Attempt-Id": "fixed-id-00000002" },
      body: JSON.stringify({ want: "", name: "Alex" }),
    }));
    expect(res.status).toBe(400);
    const j = await res.json() as Record<string, unknown>;
    expect(j.attemptId).toBe("fixed-id-00000002");
    expect(res.headers.get("X-Attempt-Id")).toBe("fixed-id-00000002");
  });

  it("non-JSON body returns 400 with attemptId", async () => {
    const res = await POST(new Request("http://localhost/api/manifest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Attempt-Id": "fixed-id-00000003" },
      body: "not json",
    }));
    expect(res.status).toBe(400);
    const j = await res.json() as Record<string, unknown>;
    expect(j.attemptId).toBe("fixed-id-00000003");
    expect(res.headers.get("X-Attempt-Id")).toBe("fixed-id-00000003");
  });
});

// ── 422 content_policy carries attemptId ─────────────────────────────────────

describe("#292 P2 — 422 content_policy carries attemptId", () => {
  it("adult gate block returns 422 with attemptId", async () => {
    // A wish that triggers the minor sexualisation gate
    const res = await POST(new Request("http://localhost/api/manifest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Attempt-Id": "fixed-id-00000004" },
      body: JSON.stringify({ want: "I am a child and I want sexual content with a 12 year old", name: "Alex" }),
    }));
    expect(res.status).toBe(422);
    const j = await res.json() as Record<string, unknown>;
    expect(j.attemptId).toBe("fixed-id-00000004");
    expect(typeof j.supportCode).toBe("string");
    expect(res.headers.get("X-Attempt-Id")).toBe("fixed-id-00000004");
  });
});

// ── 502 voice_failed carries attemptId ───────────────────────────────────────

describe("#292 P2 — 502 voice_failed carries attemptId", () => {
  it("voice failure returns 502 with attemptId and supportCode in body", async () => {
    audioMode = "fail500";
    const res = await POST(baseReq({ "X-Attempt-Id": "fixed-id-00000005" }));
    expect(res.status).toBe(502);
    const j = await res.json() as Record<string, unknown>;
    expect(j.code).toBe("voice_failed");
    expect(j.attemptId).toBe("fixed-id-00000005");
    expect(typeof j.supportCode).toBe("string");
    expect(j.supportCode).toHaveLength(8);
    expect(res.headers.get("X-Attempt-Id")).toBe("fixed-id-00000005");
  });

  it("supportCode equals first 8 hex chars of attemptId", async () => {
    audioMode = "fail500";
    const res = await POST(baseReq({ "X-Attempt-Id": "abcd1234-5678-0000-0000-000000000000" }));
    const j = await res.json() as Record<string, unknown>;
    expect(j.supportCode).toBe("abcd1234");
  });
});

// ── [ledger] lines carry attempt_id ──────────────────────────────────────────

describe("#292 P2 — [ledger] lines carry attempt_id", () => {
  it("every ledger entry for the request has attempt_id", async () => {
    audioMode = "ok";
    await POST(baseReq({ "X-Attempt-Id": "ledger-attempt-01" }));
    const entries = await L.ledger().recent(10);
    // At least one entry (script or speech)
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.attempt_id).toBe("ledger-attempt-01");
    }
  });
});

// ── standardTtsFallback is a separate config key ─────────────────────────────

describe("#292 P2 — standardTtsFallback is its own config entry", () => {
  it("limits.json has a standardTtsFallback array independent of adultTtsFallback", async () => {
    // The key goal: standard and adult fallback lists are separate config entries
    // so reordering adultTtsFallback cannot change the standard voice.
    const limits = await import("@/config/limits.json");
    const standard = (limits as unknown as { standardTtsFallback?: Array<{ id: string; model: string }> }).standardTtsFallback;
    expect(Array.isArray(standard)).toBe(true);
    expect((standard ?? []).length).toBeGreaterThan(0);
    // Each entry has id and model
    for (const v of standard ?? []) {
      expect(typeof v.id).toBe("string");
      expect(typeof v.model).toBe("string");
    }
  });

  it("route uses standardTtsFallback for the standard path (not adultTtsFallback)", async () => {
    // The mocked LIMITS has standardTtsFallback with id "standard-fb" and
    // adultTtsFallback with id "adult-fb". If voice fails and falls back,
    // the standard path must use "standard-fb", not "adult-fb".
    // We verify by checking the fallback chain built in the route doesn't include
    // the adult-only voice. Since both primary and fallback fail, the route returns 502.
    audioMode = "fail500";
    const infoSpy = vi.spyOn(console, "info");
    await POST(baseReq({ "X-Attempt-Id": "std-fallback-test-001" }));
    const audioLogs = infoSpy.mock.calls
      .filter((c) => c[0] === "[audio_stage]")
      .map((c) => JSON.parse(c[1] as string) as { voice?: string });
    // No audio log should reference the adult-only fallback id
    for (const log of audioLogs) {
      expect(log.voice).not.toBe("adult-fb");
    }
    infoSpy.mockRestore();
  });
});
