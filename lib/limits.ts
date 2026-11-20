// Limit decisions for recording. Framework-free: no Next, React or browser
// APIs. The numbers are in config/limits.json.
//
// HARD CAP: budgetVerdict, the spend ceiling. OpenRouter keeps the count, so it
// holds everywhere.
// DAILY CAPS: takeSlot's per-visitor and per-day counters. They count in a
// `Counter`. With Upstash Redis configured (lib/server/redis.ts) the count is
// shared by every server instance and survives restarts (issue #8). Without
// it, MemoryCounter keeps one copy per instance, lost on restart.
import limits from "@/config/limits.json";

/** Something that can count keys for a while: Redis, or memory as a fallback. */
export interface Counter {
  /** Adds one to each key and returns the new values; keys expire `ttlSec` after first use. */
  incr(keys: string[], ttlSec: number): Promise<number[]>;
  /** Takes one off each key (never below zero where the store can tell). */
  decr(keys: string[]): Promise<void>;
}

/** One copy per server instance; old days are dropped as the date changes. */
export class MemoryCounter implements Counter {
  private counts = new Map<string, { n: number; until: number }>();
  async incr(keys: string[], ttlSec: number): Promise<number[]> {
    const now = Date.now();
    if (this.counts.size > 20000) this.counts.clear(); // keep memory bounded
    return keys.map((k) => {
      const c = this.counts.get(k);
      const live = c && c.until > now ? c : { n: 0, until: now + ttlSec * 1000 };
      live.n++;
      this.counts.set(k, live);
      return live.n;
    });
  }
  async decr(keys: string[]): Promise<void> {
    for (const k of keys) {
      const c = this.counts.get(k);
      if (c && c.n > 0) c.n--;
    }
  }
}

const memory = new MemoryCounter();
const DAY_TTL = 2 * 24 * 60 * 60; // a little over a day, so a key outlives its date

export type Refusal = { status: number; code: string; error: string };

const today = () => new Date().toISOString().slice(0, 10);
const keysFor = (visitor: string) => {
  const d = today();
  return [`nv:slots:${d}:all`, `nv:slots:${d}:v:${visitor}`];
};

/**
 * Counts one request against the visitor and the day. Returns a refusal when
 * over, and then counts nothing. If the counter cannot be reached, refuses:
 * the limits fail closed, like the spend ceiling.
 */
export async function takeSlot(visitor: string, counter: Counter = memory): Promise<Refusal | null> {
  const keys = keysFor(visitor);
  let total: number, mine: number;
  try {
    [total, mine] = await counter.incr(keys, DAY_TTL);
  } catch {
    return { status: 503, code: "limits_unavailable", error: "Recording is paused for a moment." };
  }
  const refusal: Refusal | null =
    total > limits.globalPerDay
      ? { status: 429, code: "day_full", error: "Today's free recordings are used up. Try again tomorrow." }
      : mine > limits.perIpPerDay
        ? { status: 429, code: "visitor_full", error: "You have used today's free recordings." }
        : null;
  if (refusal) await counter.decr(keys).catch(() => undefined);
  return refusal;
}

/** Gives a slot back when nothing was spent. */
export async function returnSlot(visitor: string, counter: Counter = memory): Promise<void> {
  await counter.decr(keysFor(visitor)).catch(() => undefined);
}

/** Null while there is budget left; a refusal once the key's usage reaches the ceiling or its credit runs out. */
export function budgetVerdict(usage: number, limitRemaining: number | null | undefined): Refusal | null {
  const spent = usage >= limits.spendCeilingUsd;
  const empty = typeof limitRemaining === "number" && limitRemaining <= 0.02;
  return spent || empty
    ? { status: 429, code: "budget_spent", error: "The free recording budget is used up for now." }
    : null;
}
