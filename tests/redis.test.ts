// The Upstash counter against a stand-in for its REST API on localhost:
// a tiny Redis (INCR, EXPIRE NX, DECR) behind the /pipeline endpoint.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import limits from "@/config/limits.json";
import { takeSlot } from "@/lib/limits";

vi.mock("server-only", () => ({}));

let server: Server;
let base = "";
const store = new Map<string, number>();
const ttls = new Map<string, number>();
let fail = false;
let seenAuth = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      seenAuth = req.headers.authorization ?? "";
      res.setHeader("Content-Type", "application/json");
      if (fail || req.url !== "/pipeline") {
        res.statusCode = 500;
        return res.end("{}");
      }
      const out = (JSON.parse(raw) as (string | number)[][]).map(([cmd, key, ...rest]) => {
        const k = String(key);
        if (cmd === "PING") return { result: "PONG" };
        if (cmd === "INCR") return { result: store.set(k, (store.get(k) ?? 0) + 1).get(k) };
        if (cmd === "DECR") return { result: store.set(k, (store.get(k) ?? 0) - 1).get(k) };
        if (cmd === "EXPIRE") {
          if (rest[1] === "NX" && ttls.has(k)) return { result: 0 };
          ttls.set(k, Number(rest[0]));
          return { result: 1 };
        }
        return { error: `ERR unknown command ${cmd}` };
      });
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
  fail = false;
  for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) delete process.env[k];
});

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

  it("enforces the per-visitor limit across instances that share Redis", async () => {
    const { RedisCounter } = await import("@/lib/server/redis");
    // Two counters stand in for two server instances: they share only Redis.
    const a = new RedisCounter(base, "t");
    const b = new RedisCounter(base, "t");
    for (let i = 0; i < limits.perIpPerDay; i++) expect(await takeSlot("v1", i % 2 ? a : b)).toBeNull();
    expect((await takeSlot("v1", a))?.code).toBe("visitor_full");
    expect((await takeSlot("v1", b))?.code).toBe("visitor_full");
    expect(await takeSlot("v2", a)).toBeNull();
    expect(seenAuth).toBe("Bearer t");
    // Every key got an expiry, set once.
    expect([...ttls.values()].every((t) => t > 86400)).toBe(true);
  });

  it("enforces the day's total across instances", async () => {
    const { RedisCounter } = await import("@/lib/server/redis");
    const a = new RedisCounter(base, "t");
    for (let i = 0; i < limits.globalPerDay; i++) expect(await takeSlot(`v${i}`, a)).toBeNull();
    expect((await takeSlot("late", new RedisCounter(base, "t")))?.code).toBe("day_full");
  });

  it("fails closed when Redis cannot be reached", async () => {
    const { RedisCounter } = await import("@/lib/server/redis");
    fail = true;
    expect((await takeSlot("v1", new RedisCounter(base, "t")))?.code).toBe("limits_unavailable");
    expect((await takeSlot("v1", new RedisCounter("http://127.0.0.1:1", "t", 500)))?.status).toBe(503);
  });

  it("hashes visitor addresses before they reach Redis", async () => {
    const { visitorKey } = await import("@/lib/server/redis");
    const k = visitorKey("203.0.113.9");
    expect(k).toMatch(/^[0-9a-f]{32}$/);
    expect(k).not.toContain("203");
    expect(visitorKey("203.0.113.9")).toBe(k);
    expect(visitorKey("203.0.113.10")).not.toBe(k);
  });

  it("answers PING when reachable, and says so when not", async () => {
    const { RedisCounter } = await import("@/lib/server/redis");
    expect(await new RedisCounter(base, "t").ping()).toBe(true);
    fail = true;
    expect(await new RedisCounter(base, "t").ping()).toBe(false);
  });
});
