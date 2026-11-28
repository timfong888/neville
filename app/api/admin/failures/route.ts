import { NextResponse } from "next/server";
import { ADMIN_COOKIE, adminToken, isAdminCookie, tokenMatches } from "@/lib/server/admin";
import { failureSummaryMemory, failureSummaryRedis, todayUTC } from "@/lib/server/failureStore";

export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  // Cookie (browser UI)
  const rawCookie = req.headers.get("cookie") ?? "";
  const cookieVal = rawCookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ADMIN_COOKIE}=`))
    ?.slice(ADMIN_COOKIE.length + 1);
  if (isAdminCookie(cookieVal)) return true;

  // Bearer token (orchestrator / API)
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    return tokenMatches(auth.slice(7).trim());
  }
  return false;
}

// Returns today's failure counts + sample request IDs, keyed by reason.
// Protected by ADMIN_TOKEN (cookie or Bearer). No new secret needed.
export async function GET(req: Request) {
  if (!adminToken()) return new NextResponse("Not found", { status: 404 });
  if (!isAuthorized(req)) return new NextResponse("Unauthorized", { status: 401 });

  const day = todayUTC();
  const redisSummary = await failureSummaryRedis(day).catch(() => null);
  const summary = redisSummary ?? (failureSummaryMemory()[day] ?? {});

  return NextResponse.json({ day, summary });
}
