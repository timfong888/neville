// Upstash Redis over its REST API, used as a shared counter (issue #8).
// Plain fetch, no client library. Connected through the Vercel Marketplace,
// which sets either UPSTASH_REDIS_REST_URL / _TOKEN or KV_REST_API_URL /
// _TOKEN; both pairs are read. Without them the app counts in memory.
import "server-only";
import { createHash, createHmac } from "node:crypto";
import { type Counter, MemoryCounter, type SlotKeys } from "@/lib/limits";

let warned = false;
/** One log line per instance when the configuration is half there; never logs values. */
function warnOnce(why: string) {
  if (warned) return;
  warned = true;
  console.warn(`[limits] Redis not used (${why}); counting daily limits in memory, per instance.`);
}

export function redisEnv(): { url: string; token: string } | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "").trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "").trim();
  if (!url && !token) return null;
  if (!url || !token) {
    warnOnce(url ? "a REST URL is set but no token" : "a token is set but no REST URL");
    return null;
  }
  if (!/^https:\/\//.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) {
    warnOnce("the REST URL is not https");
    return null;
  }
  return { url: url.replace(/\/+$/, ""), token };
}

/** For tests. */
export function resetRedisWarning() {
  warned = false;
}

type Reply = { result?: unknown; error?: string };

// KEYS: day, visitor, marker. ARGV: day limit, visitor limit, ttl seconds.
// Checks both limits before changing anything; on success increments both,
// sets their expiry once, and writes this request's marker.
const RESERVE = `-- neville:reserve
local mine = tonumber(redis.call('GET', KEYS[2]) or '0')
if mine >= tonumber(ARGV[2]) then return 'visitor' end
local day = tonumber(redis.call('GET', KEYS[1]) or '0')
if day >= tonumber(ARGV[1]) then return 'day' end
redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[3], 'NX')
redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[2], ARGV[3], 'NX')
redis.call('SET', KEYS[3], '1', 'EX', ARGV[3])
return 'ok'`;

// KEYS: day, visitor, marker. Gives the slot back only if this request's
// marker exists (deleting it), so it acts at most once and never for a
// reservation that did not happen. Counts never go below zero.
const RELEASE = `-- neville:release
if redis.call('DEL', KEYS[3]) == 0 then return 0 end
for i = 1, 2 do
  local v = tonumber(redis.call('GET', KEYS[i]) or '0')
  if v > 0 then redis.call('DECR', KEYS[i]) end
end
return 1`;

export class RedisCounter implements Counter {
  constructor(
    private url: string,
    private token: string,
    private timeoutMs = 2500,
  ) {}

  /** Runs commands in one round trip. Throws on any transport or command error. */
  private async pipeline(commands: (string | number)[][]): Promise<unknown[]> {
    const res = await fetch(`${this.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      cache: "no-store",
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`redis ${res.status}`);
    const replies = (await res.json()) as Reply[];
    if (!Array.isArray(replies) || replies.length !== commands.length) throw new Error("redis: bad reply");
    const bad = replies.find((r) => r?.error);
    if (bad) throw new Error(`redis: ${bad.error}`);
    return replies.map((r) => r.result);
  }

  async reserve(keys: SlotKeys, limits: { day: number; visitor: number }, ttlSec: number): Promise<"ok" | "day" | "visitor"> {
    const [out] = await this.pipeline([
      ["EVAL", RESERVE, 3, keys.day, keys.visitor, keys.marker, limits.day, limits.visitor, ttlSec],
    ]);
    if (out === "ok" || out === "day" || out === "visitor") return out;
    throw new Error("redis: reserve returned an unexpected value");
  }

  async release(keys: SlotKeys): Promise<void> {
    await this.pipeline([["EVAL", RELEASE, 3, keys.day, keys.visitor, keys.marker]]);
  }

  /** True when Redis answers PING. */
  async ping(): Promise<boolean> {
    try {
      return (await this.pipeline([["PING"]]))[0] === "PONG";
    } catch {
      return false;
    }
  }
}

const memory = new MemoryCounter();
let shared: RedisCounter | null = null;

/** The shared counter when Upstash is configured, else this instance's memory. */
export function counter(): Counter {
  const env = redisEnv();
  if (!env) return memory;
  if (!shared) shared = new RedisCounter(env.url, env.token);
  return shared;
}

/** Where the limits are counted, for the status route and the admin page. */
export function counterKind(): "redis" | "memory" {
  return redisEnv() ? "redis" : "memory";
}

/**
 * The key that salts visitor hashes. A server secret, so someone who can read
 * Redis cannot brute-force addresses back from the hashes: LIMITS_SALT if set,
 * otherwise a hash of the OpenRouter key (the key itself is never used or
 * stored). Changing either resets the day's per-visitor counts.
 */
function salt(): string {
  const own = process.env.LIMITS_SALT?.trim();
  if (own) return own;
  const key = process.env.OPENROUTER_API_KEY?.trim();
  return key ? createHash("sha256").update(`neville-limits:${key}`, "utf8").digest("hex") : "neville-limits-dev";
}

/**
 * The visitor key: an HMAC of the address with a server secret, also keyed by
 * the day, so raw IPs are never written to Redis and keys cannot be joined
 * across days.
 */
export function visitorKey(ip: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return createHmac("sha256", salt()).update(`${day}:${ip}`, "utf8").digest("hex").slice(0, 32);
}
