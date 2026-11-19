// Spend guards for /api/manifest. Numbers live in config/limits.json.
//
// What bounds the spend, strongest first:
//  1. The spend ceiling: before every recording we ask OpenRouter how much the
//     key has used in total and refuse once it reaches `spendCeilingUsd`. This
//     is the only guard that holds across every server instance, because the
//     count is kept by OpenRouter, not by us.
//  2. The key's own credit limit and the account balance at OpenRouter.
//  3. Per-visitor and per-day counters held in memory. They reset when a
//     server instance restarts and are not shared between instances, so they
//     slow abuse down but do not cap it on their own.
import "server-only";
import limits from "@/config/limits.json";
import { OPENROUTER } from "@/lib/server/openrouter";

export const LIMITS = limits;

/** On unless config turns it off or SPEECH_ENABLED is set to "false" (a kill switch that needs no code change). */
export function generationEnabled(): boolean {
  if (process.env.SPEECH_ENABLED?.trim().toLowerCase() === "false") return false;
  return limits.generationEnabled === true;
}

const today = () => new Date().toISOString().slice(0, 10);
let day = today();
let total = 0;
const perIp = new Map<string, number>();

function roll() {
  const t = today();
  if (t !== day) {
    day = t;
    total = 0;
    perIp.clear();
  }
}

export type Refusal = { status: number; code: string; error: string };

/** Counts one request against the visitor and the day. Returns a refusal when over. */
export function takeSlot(ip: string): Refusal | null {
  roll();
  if (total >= limits.globalPerDay) {
    return { status: 429, code: "day_full", error: "Today's free recordings are used up. Try again tomorrow." };
  }
  const used = perIp.get(ip) ?? 0;
  if (used >= limits.perIpPerDay) {
    return { status: 429, code: "visitor_full", error: "You have used today's free recordings." };
  }
  if (perIp.size > 5000) perIp.clear(); // keep memory bounded
  perIp.set(ip, used + 1);
  total++;
  return null;
}

/** Gives a slot back when nothing was spent. */
export function returnSlot(ip: string) {
  const used = perIp.get(ip) ?? 0;
  if (used > 0) perIp.set(ip, used - 1);
  if (total > 0) total--;
}

/**
 * The spend ceiling. Fails closed: if OpenRouter cannot tell us the usage, we
 * do not record.
 */
export async function underCeiling(key: string): Promise<{ ok: true; usage: number } | { ok: false; refusal: Refusal }> {
  const closed: Refusal = { status: 503, code: "budget_unknown", error: "Recording is paused for a moment." };
  try {
    const res = await fetch(`${OPENROUTER}/key`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { ok: false, refusal: closed };
    const { data } = (await res.json()) as { data?: { usage?: number; limit_remaining?: number | null } };
    const usage = data?.usage;
    if (typeof usage !== "number") return { ok: false, refusal: closed };
    const spent = usage >= limits.spendCeilingUsd;
    const empty = typeof data?.limit_remaining === "number" && data.limit_remaining <= 0.02;
    if (spent || empty) {
      return {
        ok: false,
        refusal: { status: 429, code: "budget_spent", error: "The free recording budget is used up for now." },
      };
    }
    return { ok: true, usage };
  } catch {
    return { ok: false, refusal: closed };
  }
}
