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

/**
 * Free creations before the sign-up gate (variations count). SOFT MVP CAP: it
 * is counted in the browser's own storage, so clearing it or using another
 * browser resets it. It shapes the experience; it does not bound spend.
 */
export const FREE_ANON_GENERATIONS = 2;

/** The two keys a request counts against, and the request's own marker. */
export type SlotKeys = { day: string; visitor: string; marker: string };

/**
 * Where slots are counted: Redis, or memory as a fallback. Both check before
 * they increment, so a refused request changes nothing.
 */
export interface Counter {
  /**
   * Atomically: if the visitor or the day is at its limit, refuse and change
   * nothing; otherwise add one to both and record the request's marker. Keys
   * expire `ttlSec` after first use.
   */
  reserve(keys: SlotKeys, limits: { day: number; visitor: number }, ttlSec: number): Promise<"ok" | "day" | "visitor">;
  /** Gives the slot back, only if this request's marker exists (so at most once, and never for a reserve that did not happen). */
  release(keys: SlotKeys): Promise<void>;
}

/** One copy per server instance. Entries expire with their TTL. */
export class MemoryCounter implements Counter {
  private counts = new Map<string, { n: number; until: number }>();
  private markers = new Map<string, number>();

  private get(k: string, now: number): number {
    const c = this.counts.get(k);
    return c && c.until > now ? c.n : 0;
  }

  /** Keeps memory bounded without ever dropping a day's total. */
  private prune(now: number) {
    if (this.counts.size + this.markers.size <= 20000) return;
    for (const [k, c] of this.counts) if (c.until <= now) this.counts.delete(k);
    for (const [k, until] of this.markers) if (until <= now) this.markers.delete(k);
    if (this.counts.size <= 20000) return;
    for (const k of this.counts.keys()) if (!k.endsWith(":all")) this.counts.delete(k);
  }

  async reserve(keys: SlotKeys, limits: { day: number; visitor: number }, ttlSec: number) {
    const now = Date.now();
    this.prune(now);
    if (this.get(keys.visitor, now) >= limits.visitor) return "visitor" as const;
    if (this.get(keys.day, now) >= limits.day) return "day" as const;
    for (const k of [keys.day, keys.visitor]) {
      const c = this.counts.get(k);
      const live = c && c.until > now ? c : { n: 0, until: now + ttlSec * 1000 };
      live.n++;
      this.counts.set(k, live);
    }
    this.markers.set(keys.marker, now + ttlSec * 1000);
    return "ok" as const;
  }

  async release(keys: SlotKeys): Promise<void> {
    if (!this.markers.delete(keys.marker)) return;
    for (const k of [keys.day, keys.visitor]) {
      const c = this.counts.get(k);
      if (c && c.n > 0) c.n--;
    }
  }

  /** For tests. */
  size(): number {
    return this.counts.size;
  }
}

const memory = new MemoryCounter();
const DAY_TTL = 2 * 24 * 60 * 60; // a little over a day, so a key outlives its date

export type Refusal = { status: number; code: string; error: string };

const DAY_FULL: Refusal = { status: 429, code: "day_full", error: "Today's free recordings are used up. Try again tomorrow." };
const VISITOR_FULL: Refusal = { status: 429, code: "visitor_full", error: "You have used today's free recordings." };

const today = () => new Date().toISOString().slice(0, 10);

function requestId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

// Visitors and days already known to be full, remembered briefly in this
// instance so a client that keeps retrying is refused without a store call
// each time (each Redis call spends the plan's command quota).
const DENY_MS = 60_000;
const denied = new Map<string, { refusal: Refusal; until: number }>();
function knownFull(keys: string[], now: number): Refusal | null {
  for (const k of keys) {
    const d = denied.get(k);
    if (d && d.until > now) return d.refusal;
    if (d) denied.delete(k);
  }
  return null;
}
function rememberFull(key: string, refusal: Refusal, now: number) {
  if (denied.size > 10000) denied.clear();
  denied.set(key, { refusal, until: now + DENY_MS });
}
/** For tests. */
export function forgetDenied() {
  denied.clear();
}

/** A counted request. `release` gives the slot back when nothing was spent. */
export type Slot = { refusal: null; release: () => Promise<void> } | { refusal: Refusal; release: () => Promise<void> };

const nothing = async () => undefined;

/**
 * Counts one request against the visitor and the day, checking both limits
 * before counting anything, so a refused request changes no count and cannot
 * take another visitor's share of the day. Fails closed if the store cannot
 * be reached. `release` undoes exactly this request's reservation, at most once.
 */
export async function takeSlot(visitor: string, counter: Counter = memory): Promise<Slot> {
  const d = today();
  const keys: SlotKeys = { day: `nv:slots:${d}:all`, visitor: `nv:slots:${d}:v:${visitor}`, marker: `nv:slots:${d}:r:${requestId()}` };
  const now = Date.now();
  const cached = knownFull([keys.visitor, keys.day], now);
  if (cached) return { refusal: cached, release: nothing };

  let verdict: "ok" | "day" | "visitor";
  try {
    verdict = await counter.reserve(keys, { day: limits.globalPerDay, visitor: limits.perIpPerDay }, DAY_TTL);
  } catch (e) {
    // The store is down: refuse, and say so in the log (no visitor data in it).
    console.error("[limits] counter unavailable, refusing recording:", e instanceof Error ? e.message : String(e));
    // The reservation may have been applied with its reply lost. Release only
    // acts if this request's marker exists, so this cannot lower a count that
    // this request never raised.
    await counter.release(keys).catch(() => undefined);
    return { refusal: { status: 503, code: "limits_unavailable", error: "Recording is paused for a moment." }, release: nothing };
  }
  if (verdict === "visitor") {
    rememberFull(keys.visitor, VISITOR_FULL, now);
    return { refusal: VISITOR_FULL, release: nothing };
  }
  if (verdict === "day") {
    rememberFull(keys.day, DAY_FULL, now);
    return { refusal: DAY_FULL, release: nothing };
  }
  let released = false;
  return {
    refusal: null,
    release: async () => {
      if (released) return;
      released = true;
      await counter.release(keys).catch(() => undefined);
    },
  };
}

/** Null while there is budget left; a refusal once the key's usage reaches the ceiling or its credit runs out. */
export function budgetVerdict(usage: number, limitRemaining: number | null | undefined): Refusal | null {
  const spent = usage >= limits.spendCeilingUsd;
  const empty = typeof limitRemaining === "number" && limitRemaining <= 0.02;
  return spent || empty
    ? { status: 429, code: "budget_spent", error: "The free recording budget is used up for now." }
    : null;
}
