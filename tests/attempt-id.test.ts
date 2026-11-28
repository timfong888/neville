// Idempotency and integration tests for attempt-ID tracing (#261).
// Idempotency: the same attempt+step+try+event emits one PostHog event.
// Integration: a forced failure returns the sent X-Attempt-Id and logs it.
import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));

// --- Idempotency ---

describe("captureEvent dedup by attempt+step+try+event", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    process.env.POSTHOG_KEY = "phc_test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.POSTHOG_KEY;
  });

  it("sends one PostHog call when the same attempt+step+try+event is captured twice — fails without dedup", async () => {
    const { captureEvent } = await import("@/lib/server/telemetry");
    const props = { attempt_id: "uuid-aaa", step: "script", try: 1, route: "manifest" as const };
    captureEvent("script_failed", props);
    captureEvent("script_failed", props);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("sends two calls for different events on the same attempt", async () => {
    const { captureEvent } = await import("@/lib/server/telemetry");
    const id = "uuid-bbb";
    captureEvent("attempt_started", { attempt_id: id, step: "script", try: 1, route: "manifest" });
    captureEvent("script_ok",       { attempt_id: id, step: "script", try: 1, route: "manifest" });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends two calls when attempt_id differs", async () => {
    const { captureEvent } = await import("@/lib/server/telemetry");
    captureEvent("script_failed", { attempt_id: "uuid-ccc", step: "script", try: 1, route: "manifest" });
    captureEvent("script_failed", { attempt_id: "uuid-ddd", step: "script", try: 1, route: "manifest" });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not dedup events without attempt_id", async () => {
    const { captureEvent } = await import("@/lib/server/telemetry");
    captureEvent("script_failed", { route: "manifest" });
    captureEvent("script_failed", { route: "manifest" });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// --- Integration: X-Attempt-Id round-trip via manifest route ---

describe("manifest route X-Attempt-Id round-trip", () => {
  let server: Server;
  let POST: (req: Request) => Promise<Response>;
  let L: typeof import("@/lib/server/ledger");
  let scriptFails = false;
  let speechFails = false;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c: Buffer) => (raw += c));
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json");
        const path = req.url ?? "";
        if (path.startsWith("/key")) return res.end(JSON.stringify({ data: { usage: 0, limit_remaining: null } }));
        if (path.startsWith("/models")) return res.end(JSON.stringify({ data: [{ id: "google/gemini-2.5-flash-lite" }] }));
        if (path.startsWith("/chat/completions")) {
          if (scriptFails) { res.statusCode = 500; return res.end(JSON.stringify({ error: "model error" })); }
          const script = ["Take a slow breath in.", "You are whole.", "It is done."];
          return res.end(JSON.stringify({ choices: [{ message: { content: script.join("\n") } }] }));
        }
        if (path.startsWith("/audio/speech")) {
          if (speechFails) { res.statusCode = 500; return res.end("{}"); }
          res.setHeader("Content-Type", "audio/pcm;rate=24000");
          return res.end(Buffer.alloc(480));
        }
        res.statusCode = 404;
        res.end("{}");
      });
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
    scriptFails = false;
    speechFails = false;
    L.setLedger(new L.MemoryLedger());
  });

  it("echoes X-Attempt-Id from request in success response", async () => {
    const req = new Request("http://localhost/api/manifest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Attempt-Id": "test-attempt-abc123" },
      body: JSON.stringify({ want: "I am calm and confident", name: "Alex" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Attempt-Id")).toBe("test-attempt-abc123");
  });

  it("generates X-Attempt-Id when none is sent, returns a UUID", async () => {
    const req = new Request("http://localhost/api/manifest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ want: "I am calm and confident", name: "Alex" }),
    });
    const res = await POST(req);
    const id = res.headers.get("X-Attempt-Id");
    expect(id).toBeTruthy();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("returns X-Attempt-Id on script failure (template used, voice still records)", async () => {
    scriptFails = true;
    const req = new Request("http://localhost/api/manifest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Attempt-Id": "attempt-script-fail-999" },
      body: JSON.stringify({ want: "I am calm and confident", name: "Alex" }),
    });
    const res = await POST(req);
    // Template script used, voice recorded it → still 200
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Attempt-Id")).toBe("attempt-script-fail-999");
  });

  it("returns X-Attempt-Id on voice failure with 502", async () => {
    speechFails = true;
    const req = new Request("http://localhost/api/manifest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Attempt-Id": "attempt-voice-fail-888" },
      body: JSON.stringify({ want: "I am calm and confident", name: "Alex" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(502);
    expect(res.headers.get("X-Attempt-Id")).toBe("attempt-voice-fail-888");
  });
});
