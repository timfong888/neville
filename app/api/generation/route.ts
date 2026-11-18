import { NextResponse } from "next/server";
import { OPENROUTER, apiKey, paidCallsAllowed } from "@/lib/server/openrouter";

export const dynamic = "force-dynamic";

// What one generation actually cost and which model served it, from OpenRouter's
// own record. Preview and local only. Used to check list prices against the bill.
export async function GET(req: Request) {
  if (!paidCallsAllowed()) return NextResponse.json({ error: "Not available in production." }, { status: 404 });
  const key = apiKey();
  if (!key) return NextResponse.json({ error: "OPENROUTER_API_KEY is not set for this environment." }, { status: 503 });

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^gen-[A-Za-z0-9-]{8,80}$/.test(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });

  const res = await fetch(`${OPENROUTER}/generation?id=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) return NextResponse.json({ error: `OpenRouter returned ${res.status}.` }, { status: res.status === 404 ? 404 : 502 });
  const { data } = (await res.json()) as { data?: Record<string, unknown> };
  return NextResponse.json({
    id,
    model: data?.model ?? null,
    provider: data?.provider_name ?? null,
    totalCostUsd: typeof data?.total_cost === "number" ? data.total_cost : null,
  });
}
