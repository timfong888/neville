// The Upstash counter against a stand-in for its REST API on localhost. The
// stand-in runs the logic of the two Lua scripts (reserve, release) and plain
// PING, behind the /pipeline endpoint, one request at a time like Redis.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import limits from "@/config/limits.json";
import { forgetDenied, takeSlot } from "@/lib/limits";

vi.mock("server-only", () => ({}));

let server: Server;
let base = "";
const store = new Map<string, number>();
const ttls = new Map<string, number>();
let fail = false;
let applyThenFail = false;
let failBeforeApply = false;
let seenAuth = "";
let calls = 0;

function run([cmd, ...args]: (string | number)[]): { result?: unknown; error?: string } {
  if (cmd === "PING") return { result: "PONG" };
  if (cmd !== "EVAL") return { error: `ERR unknown command ${cmd}` };
  const [script, , day, visitor, marker, ...argv] = args.map(String);
  const get = (k: string) => store.get(k) ?? 0;
  if (script.startsWith("-- neville:reserve")) {
    const [dayMax, visitorMax, ttl] = argv.map(Number);
    if (get(visitor) >= visitorMax) return { result: "visitor" };
    if (get(day) >= dayMax) return { result: "day" };
    for (const k of [day, visitor]) {
      store.set(k, get(k) + 1);
      if (!ttls.has(k)) ttls.set(k, ttl);
    }
    store.set(marker, 1);
    ttls.set(marker, ttl);
    return { result: "ok" };
  }
  if (script.startsWith("-- neville:release")) {
    if (!store.has(marker)) return { result: 0 };
    store.delete(marker);
    for (const k of [day, visitor]) if (get(k) > 0) store.set(k, get(k) - 1);
    return { result: 1 };
  }
  return { error: "ERR unknown script" };
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      calls++;
      seenAuth = req.headers.authorization ?? "";
      res.setHeader("Content-Type", "application/json");
      if (fail || failBeforeApply || req.url !== "/pipeline") {
        res.statusCode = 500;
        return res.end("{}");
      }
      const out = (JSON.parse(raw) as (string | number)[][]).map(run);
      if (applyThenFail) {
        // The commands ran, but the reply never arrives in time.
        res.statusCode = 504;
        return res.end("{}");
      }
      res.end(JSON.stringify(out));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const a = server.address();
  if (!a || typeof a === "string") throw new Error("no port");
  base = `http://127.0.0.1:${a.port}`;
});
afterAll(() => server.close());
beforeEach(() => {
  store.clear();
  ttls.clear();
  fail = applyThenFail = failBeforeApply = false;
  calls = 0;
  forgetDenied();
  for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) delete process.env[k];
});

const visitorCount = (v: string) =>
  [...store.entries()].filter(([k]) => k.endsWith(`:v:${v}`)).reduce((n, [, c]) => n + c, 0);
const dayCount = () => [...store.entries()].filter(([k]) => k.endsWith(":all")).reduce((n, [, c]) => n + c, 0);

describe("Upstash counter", () => {
  it("reads either env var pair, and falls back to memory with neither", async () => {
    const R = await import("@/lib/server/redis");
    expect(R.counterKind()).toBe("memory");
    process.env.KV_REST_API_URL = base + "/";
    process.env.KV_REST_API_TOKEN = "kv-token";
    expect(R.redisEnv()).toEqual({ url: base, token: "kv-token" });
    delete process.env.KV_REST_API_URL;
    process.env.UPSTASH_REDIS_REST_URL = base;
    process.env.UPSTASH_REDIS_REST_TOKEN = "up-token";
    expect(R.redisEnv()).toEqual({ url: base, token: "up-token" });
    expect(R.counterKind()).toBe("redis");
  });

  it("warns once and uses memory when the variables are half set or not https", async () => {
    const R = await import("@/lib/server/redis");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    R.resetRedisWarning();
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    expect(R.redisEnv()).toBeNull();
    expect(R.counterKind()).toBe("memory");
    process.env.UPSTASH_REDIS_REST_TOKEN = "t";
    process.env.UPSTASH_REDIS_REST_URL = "http://example.upstash.io";
    expect(R.redisEnv()).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).not.toContain("example.upstash.io");
    warn.mockRestore();
  });

  it("enforces the per-visitor limit across instances that share Redis", async () => {
    const { RedisCounter } = await import("@/lib/server/redis");
    const a = new RedisCounter(base, "t");
    const b = new RedisCounter(base, "t");
    for (let i = 0; i < limits.perIpPerDay; i++) expect((await takeSlot("v1", i % 2 ? a : b)).refusal).toBeNull();
    expect((await takeSlot("v1", a)).refusal?.code).toBe("visitor_full");
    forgetDenied(); // as if on another instance with no cache
    expect((await takeSlot("v1", b)).refusal?.code).toBe("visitor_full");
    expect((await takeSlot("v2", a)).refusal).toBeNull();
    expect(seenAuth).toBe("Bearer t");
    expect([...ttls.values()].every((t) => t > 86400)).toBe(true);
  });

  it("enforces the day's total across instances", async () => {
    const { RedisCounter } = await import("@/lib/server/redis");
    const a = new RedisCounter(base, "t");
    for (let i = 0; i < limits.globalPerDay; i++) expect((await takeSlot(`v${i}`, a)).refusal).toBeNull();
    expect((await takeSlot("late", new RedisCounter(base, "t"))).refusal?.code).toBe("day_full");
  });

  it("a refused request changes no count, and a burst from one full visitor takes no one else's share", async () => {
    const { RedisCounter } = await import("@/lib/server/redis");
    const c = new RedisCounter(base, "t");
    for (let i = 0; i < limits.perIpPerDay; i++) await takeSlot("greedy", c);
    const before = dayCount();
    // 300 concurrent requests from the exhausted visitor, across "instances" with no shared cache.
    const burst = await Promise.all(
      Array.from({ length: 300 }, () => {
        forgetDenied();
        return takeSlot("greedy", new RedisCounter(base, "t"));
      }),
    );
    expect(burst.every((s) => s.refusal?.code === "visitor_full")).toBe(true);
    expect(dayCount()).toBe(before);
    expect(visitorCount("greedy")).toBe(limits.perIpPerDay);
    // Everyone else still gets the rest of the day.
    for (let i = 0; i < limits.globalPerDay - limits.perIpPerDay; i++) {
      expect((await takeSlot(`other${i}`, c)).refusal).toBeNull();
    }
  });

  it("refuses a visitor known to be full without calling Redis again", async () => {
    const { RedisCounter } = await import("@/lib/server/redis");
    const c = new RedisCounter(base, "t");
    for (let i = 0; i < limits.perIpPerDay; i++) await takeSlot("v1", c);
    await takeSlot("v1", c); // refused by Redis; remembered
    const n = calls;
    for (let i = 0; i < 50; i++) expect((await takeSlot("v1", c)).refusal?.code).toBe("visitor_full");
    expect(calls).toBe(n);
  });

  it("release gives back exactly one slot, once", async () => {
    const { RedisCounter } = await import("@/lib/server/redis");
    const c = new RedisCounter(base, "t");
    const s = await takeSlot("v1", c);
    expect(visitorCount("v1")).toBe(1);
    await s.release();
    await s.release();
    expect(visitorCount("v1")).toBe(0);
    expect(dayCount()).toBe(0);
  });

  it("fails closed when Redis cannot be reached, and logs it", async () => {
    const { RedisCounter } = await import("@/lib/server/redis");
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fail = true;
    expect((await takeSlot("v1", new RedisCounter(base, "t"))).refusal?.code).toBe("limits_unavailable");
    expect((await takeSlot("v1", new RedisCounter("http://127.0.0.1:1", "t", 500))).refusal?.status).toBe(503);
    expect(err).toHaveBeenCalled();
    expect(String(err.mock.calls[0][0])).toContain("[limits]");
    err.mockRestore();
  });

  it("gives the slot back when Redis applied the reservation but the reply was lost", async () => {
    const { RedisCounter } = await import("@/lib/server/redis");
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const c = new RedisCounter(base, "t");
    applyThenFail = true;
    expect((await takeSlot("v1", c)).refusal?.code).toBe("limits_unavailable");
    applyThenFail = false;
    // The compensating release ran while replies were failing, so it applied too.
    expect(visitorCount("v1")).toBe(0);
    expect(dayCount()).toBe(0);
    err.mockRestore();
  });

  it("a failure before anything was applied does not lower an existing count", async () => {
    const { RedisCounter } = await import("@/lib/server/redis");
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const c = new RedisCounter(base, "t");
    for (let i = 0; i < limits.perIpPerDay - 1; i++) await takeSlot("v1", c);
    // Requests fail before they reach the store; the compensating release finds no marker.
    failBeforeApply = true;
    expect((await takeSlot("v1", c)).refusal?.code).toBe("limits_unavailable");
    failBeforeApply = false;
    expect(visitorCount("v1")).toBe(limits.perIpPerDay - 1);
    expect((await takeSlot("v1", c)).refusal).toBeNull();
    expect((await takeSlot("v1", c)).refusal?.code).toBe("visitor_full");
    err.mockRestore();
  });

  it("answers PING when reachable, and says so when not", async () => {
    const { RedisCounter } = await import("@/lib/server/redis");
    expect(await new RedisCounter(base, "t").ping()).toBe(true);
    fail = true;
    expect(await new RedisCounter(base, "t").ping()).toBe(false);
  });

  it("stores visitors only as an HMAC keyed by a server secret", async () => {
    const { visitorKey } = await import("@/lib/server/redis");
    const k = visitorKey("203.0.113.9");
    expect(k).toMatch(/^[0-9a-f]{32}$/);
    expect(k).not.toContain("203");
    expect(visitorKey("203.0.113.9")).toBe(k);
    expect(visitorKey("203.0.113.10")).not.toBe(k);
    process.env.LIMITS_SALT = "another-secret";
    expect(visitorKey("203.0.113.9")).not.toBe(k);
    delete process.env.LIMITS_SALT;
  });
});
