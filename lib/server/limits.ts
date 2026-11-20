// Spend guards for /api/manifest. Numbers live in config/limits.json.
//
// What bounds the spend, strongest first:
//  1. The spend ceiling: before every recording we ask OpenRouter how much the
//     key has used in total and refuse once it reaches `spendCeilingUsd`. This
//     is the only guard that holds across every server instance, because the
//     count is kept by OpenRouter, not by us.
//  2. The key's own credit limit and the account balance at OpenRouter.
//  3. Per-visitor and per-day counters. With Upstash Redis configured
//     (lib/server/redis.ts) they are shared by every instance and survive
//     restarts, and they fail closed if Redis cannot be reached. Without it
//     they fall back to memory, one copy per instance.
import "server-only";
import limits from "@/config/limits.json";
import { OPENROUTER } from "@/lib/server/openrouter";
import { type Refusal, budgetVerdict, returnSlot as returnIn, takeSlot as takeIn } from "@/lib/limits";
import { counter, visitorKey } from "@/lib/server/redis";

/** Counts one request against the visitor and the day, in Redis when configured. */
export function takeSlot(ip: string) {
  return takeIn(visitorKey(ip), counter());
}

/** Gives a slot back when nothing was spent. */
export function returnSlot(ip: string) {
  return returnIn(visitorKey(ip), counter());
}

export const LIMITS = limits;

/** On unless config turns it off or SPEECH_ENABLED is set to "false" (a kill switch that needs no code change). */
export function generationEnabled(): boolean {
  if (process.env.SPEECH_ENABLED?.trim().toLowerCase() === "false") return false;
  return limits.generationEnabled === true;
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
    const refusal = budgetVerdict(usage, data?.limit_remaining);
    if (refusal) return { ok: false, refusal };
    return { ok: true, usage };
  } catch {
    return { ok: false, refusal: closed };
  }
}
