import { NextResponse } from "next/server";
import { ADMIN_COOKIE, adminToken, isAdminCookie, tokenMatches } from "@/lib/server/admin";
import { failureSummaryMemory, failureSummaryRedis, todayUTC } from "@/lib/server/failureStore";
import { runTriage } from "@/lib/server/triage";

export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const rawCookie = req.headers.get("cookie") ?? "";
  const cookieVal = rawCookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ADMIN_COOKIE}=`))
    ?.slice(ADMIN_COOKIE.length + 1);
  if (isAdminCookie(cookieVal)) return true;
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) return tokenMatches(auth.slice(7).trim());
  return false;
}

// Called by the orchestrator on its daily check-in. Reads today's failure
// summary and opens one GitHub issue per new reason (label: auto-triage).
// Protected by ADMIN_TOKEN. Requires GITHUB_TOKEN in env.
export async function POST(req: Request) {
  if (!adminToken()) return new NextResponse("Not found", { status: 404 });
  if (!isAuthorized(req)) return new NextResponse("Unauthorized", { status: 401 });

  const day = todayUTC();
  const redisSummary = await failureSummaryRedis(day).catch(() => null);
  const summary = redisSummary ?? (failureSummaryMemory()[day] ?? {});

  if (Object.keys(summary).length === 0) {
    return NextResponse.json({ day, message: "No failures recorded today.", created: [], skipped: [] });
  }

  try {
    const result = await runTriage(summary, day);
    return NextResponse.json({ day, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "triage failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
