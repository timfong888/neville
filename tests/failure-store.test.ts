import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mockWaitUntil = vi.fn();
vi.mock("@vercel/functions", () => ({ waitUntil: mockWaitUntil }));

// Always start with no Redis so tests use the in-memory path
vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
vi.stubEnv("KV_REST_API_URL", "");
vi.stubEnv("KV_REST_API_TOKEN", "");

async function fresh() {
  vi.resetModules();
  return import("@/lib/server/failureStore");
}

describe("failureStore", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("recordFailure increments count for the reason", async () => {
    const { recordFailure, resetFailureStore, failureSummaryMemory } = await fresh();
    resetFailureStore();
    recordFailure("voice_failed:http_status", "req_1");
    recordFailure("voice_failed:http_status", "req_2");
    const mem = failureSummaryMemory();
    const today = new Date().toISOString().slice(0, 10);
    expect(mem[today]?.["voice_failed:http_status"]?.count).toBe(2);
  });

  it("stores up to 5 sample request IDs, no more", async () => {
    const { recordFailure, resetFailureStore, failureSummaryMemory } = await fresh();
    resetFailureStore();
    for (let i = 0; i < 7; i++) recordFailure("script_failed:timeout", `req_${i}`);
    const today = new Date().toISOString().slice(0, 10);
    const mem = failureSummaryMemory();
    expect(mem[today]?.["script_failed:timeout"]?.sampleIds).toHaveLength(5);
    expect(mem[today]?.["script_failed:timeout"]?.count).toBe(7);
  });

  it("groups failures by reason independently", async () => {
    const { recordFailure, resetFailureStore, failureSummaryMemory } = await fresh();
    resetFailureStore();
    recordFailure("voice_failed:http_status");
    recordFailure("voice_failed:http_status");
    recordFailure("script_failed:timeout");
    const today = new Date().toISOString().slice(0, 10);
    const mem = failureSummaryMemory();
    expect(mem[today]?.["voice_failed:http_status"]?.count).toBe(2);
    expect(mem[today]?.["script_failed:timeout"]?.count).toBe(1);
  });

  it("returns empty object when no failures recorded", async () => {
    const { resetFailureStore, failureSummaryMemory } = await fresh();
    resetFailureStore();
    expect(failureSummaryMemory()).toEqual({});
  });

  it("omits requestId from sampleIds when not provided", async () => {
    const { recordFailure, resetFailureStore, failureSummaryMemory } = await fresh();
    resetFailureStore();
    recordFailure("manifest_timeout:timeout");
    const today = new Date().toISOString().slice(0, 10);
    const mem = failureSummaryMemory();
    expect(mem[today]?.["manifest_timeout:timeout"]?.sampleIds).toHaveLength(0);
    expect(mem[today]?.["manifest_timeout:timeout"]?.count).toBe(1);
  });

  it("calls waitUntil to keep the Redis write alive in serverless context", async () => {
    mockWaitUntil.mockClear();
    const { recordFailure, resetFailureStore } = await fresh();
    resetFailureStore();
    recordFailure("voice_failed:http_status", "req_wait");
    expect(mockWaitUntil).toHaveBeenCalledOnce();
    const arg = mockWaitUntil.mock.calls[0][0];
    expect(arg).toBeInstanceOf(Promise);
  });
});

// Regression test: alertFailure enriches events with provider and build,
// and records to the failure store. These tests fail on main (failureStore
// didn't exist) and pass on this branch.
describe("alertFailure enrichment (regression)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    delete process.env.POSTHOG_KEY;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
  });

  it("derives provider from model and includes it in the PostHog event", async () => {
    process.env.POSTHOG_KEY = "phc_testkey";
    const { alertFailure } = await import("@/lib/server/alertFailure");
    const { resetFailureStore } = await import("@/lib/server/failureStore");
    resetFailureStore();
    alertFailure("voice_failed", { route: "manifest", model: "heygen/avatar", status: 502 });
    await new Promise((r) => setTimeout(r, 20));
    const posthogCall = fetchMock.mock.calls.find(
      (args: unknown[]) => typeof args[0] === "string" && (args[0] as string).includes("posthog"),
    );
    expect(posthogCall).toBeDefined();
    const body = JSON.parse((posthogCall as [string, RequestInit])[1].body as string) as Record<string, unknown>;
    const props = body.properties as Record<string, unknown>;
    expect(props.provider).toBe("heygen");
  });

  it("includes build from VERCEL_GIT_COMMIT_SHA when set", async () => {
    process.env.POSTHOG_KEY = "phc_testkey";
    process.env.VERCEL_GIT_COMMIT_SHA = "abc1234def";
    vi.resetModules();
    const { alertFailure } = await import("@/lib/server/alertFailure");
    const { resetFailureStore } = await import("@/lib/server/failureStore");
    resetFailureStore();
    alertFailure("script_failed", { route: "manifest", reason: "timeout" });
    await new Promise((r) => setTimeout(r, 20));
    const posthogCall = fetchMock.mock.calls.find(
      (args: unknown[]) => typeof args[0] === "string" && (args[0] as string).includes("posthog"),
    );
    const body = JSON.parse((posthogCall as [string, RequestInit])[1].body as string) as Record<string, unknown>;
    expect((body.properties as Record<string, unknown>).build).toBe("abc1234");
  });

  it("records to failureStore so the summary endpoint has data", async () => {
    process.env.POSTHOG_KEY = "phc_testkey";
    vi.resetModules();
    const { alertFailure } = await import("@/lib/server/alertFailure");
    const { resetFailureStore, failureSummaryMemory } = await import("@/lib/server/failureStore");
    resetFailureStore();
    alertFailure("voice_failed", { route: "rerecord", model: "google/gemini-tts", status: 503, requestId: "req_42" });
    const today = new Date().toISOString().slice(0, 10);
    const mem = failureSummaryMemory();
    // The store key uses `kind:reason` — reason defaults to "unknown" when absent
    const entry = mem[today]?.["voice_failed:unknown"];
    expect(entry?.count).toBe(1);
    expect(entry?.sampleIds).toContain("req_42");
  });

  it("generates a correlation ID so sampleIds is never empty even without requestId", async () => {
    process.env.POSTHOG_KEY = "phc_testkey";
    vi.resetModules();
    const { alertFailure } = await import("@/lib/server/alertFailure");
    const { resetFailureStore, failureSummaryMemory } = await import("@/lib/server/failureStore");
    resetFailureStore();
    alertFailure("manifest_timeout", { route: "manifest", reason: "timeout" });
    const today = new Date().toISOString().slice(0, 10);
    const mem = failureSummaryMemory();
    const entry = mem[today]?.["manifest_timeout:timeout"];
    expect(entry?.count).toBe(1);
    expect(entry?.sampleIds).toHaveLength(1);
    expect(entry?.sampleIds[0]).toBeTruthy();
  });

  it("never includes forbidden fields (wish, name, script text)", async () => {
    process.env.POSTHOG_KEY = "phc_testkey";
    vi.resetModules();
    const { alertFailure } = await import("@/lib/server/alertFailure");
    const { resetFailureStore } = await import("@/lib/server/failureStore");
    resetFailureStore();
    alertFailure("script_failed", { route: "manifest", reason: "timeout", model: "openai/gpt" });
    await new Promise((r) => setTimeout(r, 20));
    const posthogCall = fetchMock.mock.calls.find(
      (args: unknown[]) => typeof args[0] === "string" && (args[0] as string).includes("posthog"),
    );
    const props = JSON.parse((posthogCall as [string, RequestInit])[1].body as string)
      .properties as Record<string, unknown>;
    for (const forbidden of ["wish", "name", "script", "want", "text", "email"]) {
      expect(props).not.toHaveProperty(forbidden);
    }
  });
});
