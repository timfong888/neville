// AT-304 acceptance tests: vet-decision log line and attemptId/supportCode in every response.
//
// AT-4: every vet decision writes the structured log line; never logs the script text or email.
// AT-2: 422 (and other JSON error) responses include attemptId and supportCode in the body.
//
// These tests fail on main without the fix in app/api/rerecord/route.ts.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let server: Server;
let POST: (req: Request) => Promise<Response>;
let L: typeof import("@/lib/server/ledger");
let vetReply = "OK";

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.url?.startsWith("/models")) {
        return res.end(JSON.stringify({ data: [{ id: "google/gemini-2.5-flash-lite" }] }));
      }
      if (req.url?.startsWith("/key")) return res.end(JSON.stringify({ data: { usage: 0, limit_remaining: null } }));
      if (req.url?.startsWith("/chat/completions")) {
        return res.end(JSON.stringify({ choices: [{ message: { content: vetReply } }], usage: { cost: 0.00001 } }));
      }
      if (req.url?.startsWith("/audio/speech")) {
        res.setHeader("Content-Type", "audio/pcm;rate=24000");
        return res.end(Buffer.alloc(480));
      }
      res.statusCode = 404;
      res.end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address() as AddressInfo;
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${addr.port}`;
  process.env.OPENROUTER_API_KEY = "test-key";
  ({ POST } = await import("@/app/api/rerecord/route"));
  L = await import("@/lib/server/ledger");
});

afterAll(() => {
  server.close();
  delete process.env.OPENROUTER_BASE_URL;
  delete process.env.OPENROUTER_API_KEY;
});

let ipN = 100;
const req = (body: unknown) =>
  new Request("http://localhost/api/rerecord", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": `10.1.0.${++ipN}` },
    body: JSON.stringify(body),
  });

const script = { lines: ["Take a slow breath.", "You are calm."], voiceId: null };

beforeEach(() => {
  vetReply = "OK";
  delete process.env.ADULT_TIER_ENABLED;
  delete process.env.ADULT_TIER_EMAILS;
  delete process.env.RELAXED_FILTER_EMAILS;
  L.setLedger(new L.MemoryLedger());
  L.resetAlerts();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// AT-4: vet decision log line is written with correct fields, never logs script or email.
describe("AT-4: vet-decision log line", () => {
  it("writes [vet_decision] log line on every vet call — fails on main without fix", async () => {
    const spy = vi.spyOn(console, "info");
    await POST(req(script));
    const lines = spy.mock.calls.map(([tag]) => tag as string);
    expect(lines).toContain("[vet_decision]");
  });

  it("log line contains attempt_id, route, tier_flag, allowlisted, reason, relaxed, verdict", async () => {
    const spy = vi.spyOn(console, "info");
    await POST(req(script));
    const call = spy.mock.calls.find(([tag]) => tag === "[vet_decision]");
    expect(call).toBeDefined();
    const fields = JSON.parse(call![1] as string) as Record<string, unknown>;
    expect(typeof fields.attempt_id).toBe("string");
    expect(fields.route).toBe("rerecord");
    expect(typeof fields.tier_flag).toBe("boolean");
    expect(typeof fields.allowlisted).toBe("boolean");
    expect(["flag_off", "no_email", "not_listed", "listed"]).toContain(fields.reason);
    expect(typeof fields.relaxed).toBe("boolean");
    expect(["yes", "no"]).toContain(fields.verdict);
  });

  it("log line contains verdict=yes when vet approves", async () => {
    vetReply = "OK";
    const spy = vi.spyOn(console, "info");
    await POST(req(script));
    const call = spy.mock.calls.find(([tag]) => tag === "[vet_decision]");
    const fields = JSON.parse(call![1] as string) as Record<string, unknown>;
    expect(fields.verdict).toBe("yes");
  });

  it("log line contains verdict=no and block_class when vet rejects", async () => {
    vetReply = "NO";
    const spy = vi.spyOn(console, "info");
    await POST(req(script));
    const call = spy.mock.calls.find(([tag]) => tag === "[vet_decision]");
    expect(call).toBeDefined();
    const fields = JSON.parse(call![1] as string) as Record<string, unknown>;
    expect(fields.verdict).toBe("no");
    expect(fields.block_class).toBe("rejected");
  });

  it("log line does NOT contain the script text", async () => {
    const spy = vi.spyOn(console, "info");
    await POST(req(script));
    const call = spy.mock.calls.find(([tag]) => tag === "[vet_decision]");
    const raw = call![1] as string;
    // The script lines must never appear in the log line.
    expect(raw).not.toContain("Take a slow breath");
    expect(raw).not.toContain("You are calm");
  });

  it("log line reason=flag_off when ADULT_TIER_ENABLED is not set", async () => {
    const spy = vi.spyOn(console, "info");
    await POST(req(script));
    const call = spy.mock.calls.find(([tag]) => tag === "[vet_decision]");
    const fields = JSON.parse(call![1] as string) as Record<string, unknown>;
    expect(fields.reason).toBe("flag_off");
    expect(fields.tier_flag).toBe(false);
  });

  it("log line reason=no_email when tier is on but no session", async () => {
    process.env.ADULT_TIER_ENABLED = "true";
    process.env.ADULT_TIER_EMAILS = "adult@example.com";
    const spy = vi.spyOn(console, "info");
    await POST(req(script));
    const call = spy.mock.calls.find(([tag]) => tag === "[vet_decision]");
    const fields = JSON.parse(call![1] as string) as Record<string, unknown>;
    expect(fields.reason).toBe("no_email");
    expect(fields.tier_flag).toBe(true);
    expect(fields.allowlisted).toBe(false);
  });
});

// AT-2: 422 response includes attemptId and supportCode — fails on main without fix.
describe("AT-2: attemptId and supportCode in every JSON response", () => {
  it("422 not_recordable response body includes attemptId and supportCode — fails on main without fix", async () => {
    vetReply = "NO";
    const res = await POST(req(script));
    expect(res.status).toBe(422);
    const j = await res.json() as Record<string, unknown>;
    expect(typeof j.attemptId).toBe("string");
    expect(typeof j.supportCode).toBe("string");
    // supportCode is first 8 hex chars of attemptId (no dashes)
    const expectedCode = (j.attemptId as string).replace(/-/g, "").slice(0, 8);
    expect(j.supportCode).toBe(expectedCode);
  });

  it("attemptId in 422 body matches X-Attempt-Id header", async () => {
    vetReply = "NO";
    const res = await POST(req(script));
    const j = await res.json() as Record<string, unknown>;
    expect(j.attemptId).toBe(res.headers.get("X-Attempt-Id"));
  });

  it("503 off response body includes attemptId and supportCode", async () => {
    process.env.SPEECH_ENABLED = "false";
    const res = await POST(req(script));
    expect(res.status).toBe(503);
    const j = await res.json() as Record<string, unknown>;
    expect(j.code).toBe("off");
    expect(typeof j.attemptId).toBe("string");
    expect(typeof j.supportCode).toBe("string");
    delete process.env.SPEECH_ENABLED;
  });

  it("400 bad_request response body includes attemptId and supportCode", async () => {
    const res = await POST(new Request("http://localhost/api/rerecord", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": "10.1.0.200" },
      body: "not json{{{",
    }));
    expect(res.status).toBe(400);
    const j = await res.json() as Record<string, unknown>;
    expect(typeof j.attemptId).toBe("string");
    expect(typeof j.supportCode).toBe("string");
  });

  it("200 success response includes X-Attempt-Id and X-Support-Code headers", async () => {
    const res = await POST(req(script));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Attempt-Id")).toBeTruthy();
    expect(res.headers.get("X-Support-Code")).toBeTruthy();
    const id = res.headers.get("X-Attempt-Id")!;
    const code = id.replace(/-/g, "").slice(0, 8);
    expect(res.headers.get("X-Support-Code")).toBe(code);
  });
});
