import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));

async function freshModule() {
  vi.resetModules();
  return import("@/lib/server/telemetry");
}

describe("captureEvent", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    delete process.env.POSTHOG_KEY;
  });

  it("is a no-op when POSTHOG_KEY is unset", async () => {
    delete process.env.POSTHOG_KEY;
    const { captureEvent } = await freshModule();
    captureEvent("test_event", { route: "manifest" });
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the correct URL with the right payload shape", async () => {
    process.env.POSTHOG_KEY = "phc_testkey";
    const { captureEvent } = await freshModule();
    captureEvent("script_failed", { route: "manifest", reason: "timeout", elapsedMs: 1234 });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://us.i.posthog.com/capture/");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.api_key).toBe("phc_testkey");
    expect(body.event).toBe("script_failed");
    expect(body.distinct_id).toBe("server");
    const props = body.properties as Record<string, unknown>;
    expect(props.route).toBe("manifest");
    expect(props.reason).toBe("timeout");
    expect(props.elapsedMs).toBe(1234);
  });

  it("never includes forbidden fields in properties", async () => {
    process.env.POSTHOG_KEY = "phc_testkey";
    const { captureEvent } = await freshModule();
    captureEvent("voice_failed", { route: "manifest", model: "heygen/xyz", status: 502 });
    await new Promise((r) => setTimeout(r, 20));
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, unknown>;
    const props = body.properties as Record<string, unknown>;
    for (const forbidden of ["wish", "name", "script", "email", "key", "want", "text"]) {
      expect(props).not.toHaveProperty(forbidden);
    }
    expect(props).not.toHaveProperty("api_key");
  });

  it("never throws when fetch rejects", async () => {
    process.env.POSTHOG_KEY = "phc_testkey";
    fetchMock.mockRejectedValue(new Error("network failure"));
    const { captureEvent } = await freshModule();
    expect(() => captureEvent("manifest_timeout", { route: "manifest", elapsedMs: 60000 })).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
  });

  it("never throws when fetch throws synchronously", async () => {
    process.env.POSTHOG_KEY = "phc_testkey";
    fetchMock.mockImplementation(() => { throw new Error("sync error"); });
    const { captureEvent } = await freshModule();
    expect(() => captureEvent("manifest_timeout", { route: "manifest" })).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
  });
});
