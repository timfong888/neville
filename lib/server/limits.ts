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
import { type Refusal, budgetVerdict } from "@/lib/limits";
import { checkBudget } from "@/lib/server/ledger";

export { returnExpandSlot, returnSlot, takeExpandSlot, takeSlot } from "@/lib/limits";

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
    await checkBudget(usage); // 50 / 80 / 100% alerts; never throws
    const refusal = budgetVerdict(usage, data?.limit_remaining);
    if (refusal) return { ok: false, refusal };
    return { ok: true, usage };
  } catch {
    return { ok: false, refusal: closed };
  }
}
