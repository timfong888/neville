import { NextResponse } from "next/server";
import { OPENROUTER, apiKey, paidCallsAllowed } from "@/lib/server/openrouter";

export const dynamic = "force-dynamic";

// Reports whether the OpenRouter key is configured and what budget it has left.
// It never returns the key, its label or any part of it.
export async function GET() {
  const key = apiKey();
  const base = {
    environment: process.env.VERCEL_ENV ?? "local",
    paidCallsAllowed: paidCallsAllowed(),
    keyPresent: Boolean(key),
  };
  if (!key) return NextResponse.json(base);

  try {
    const res = await fetch(`${OPENROUTER}/key`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ ...base, keyValid: false, keyCheckStatus: res.status });
    }
    const { data } = (await res.json()) as {
      data?: { limit?: number | null; limit_remaining?: number | null; usage?: number; limit_reset?: string | null };
    };
    return NextResponse.json({
      ...base,
      keyValid: true,
      limit: data?.limit ?? null,
      limitRemaining: data?.limit_remaining ?? null,
      usage: data?.usage ?? null,
      limitReset: data?.limit_reset ?? null,
    });
  } catch {
    return NextResponse.json({ ...base, keyValid: null, keyCheckStatus: "unreachable" });
  }
}
