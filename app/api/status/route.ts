import { NextResponse } from "next/server";
import { OPENROUTER, apiKey, paidCallsAllowed } from "@/lib/server/openrouter";
import { counterKind, redisReachable } from "@/lib/server/redis";

export const dynamic = "force-dynamic";

// Reports whether the OpenRouter key is configured and what budget it has left.
// It never returns the key, its label or any part of it.
export async function GET() {
  const key = apiKey();
  const base = {
    environment: process.env.VERCEL_ENV ?? "local",
    paidCallsAllowed: paidCallsAllowed(),
    keyPresent: Boolean(key),
    // Where the daily limits are counted: "redis" (shared) or "memory" (per instance).
    limitsStore: counterKind(),
  };
  // The live site is public: it says only whether a key exists, never the budget,
  // and does not ping Redis (each ping spends the free plan's command quota).
  if (!paidCallsAllowed()) return NextResponse.json(base);
  const withRedis = { ...base, redisReachable: await redisReachable() };
  if (!key) return NextResponse.json(withRedis);

  try {
    const res = await fetch(`${OPENROUTER}/key`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ ...withRedis, keyValid: false, keyCheckStatus: res.status });
    }
    const { data } = (await res.json()) as {
      data?: { limit?: number | null; limit_remaining?: number | null; usage?: number; limit_reset?: string | null };
    };
    return NextResponse.json({
      ...withRedis,
      keyValid: true,
      limit: data?.limit ?? null,
      limitRemaining: data?.limit_remaining ?? null,
      usage: data?.usage ?? null,
      limitReset: data?.limit_reset ?? null,
    });
  } catch {
    return NextResponse.json({ ...withRedis, keyValid: null, keyCheckStatus: "unreachable" });
  }
}
