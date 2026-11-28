import "server-only";
import { waitUntil } from "@vercel/functions";
import { redisEnv } from "@/lib/server/redis";

export type FailureEntry = { count: number; sampleIds: string[] };
export type DaySummary = Record<string, FailureEntry>;

const MAX_IDS = 5;
const TTL_SEC = 8 * 24 * 3600;

const mem = new Map<string, FailureEntry>();
// Idempotency: each requestId is counted exactly once per reason per day.
const seen = new Set<string>();

export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export function recordFailure(reason: string, requestId?: string): void {
  const k = `${todayUTC()}:${reason}`;
  if (requestId) {
    const dedup = `${k}:${requestId}`;
    if (seen.has(dedup)) return;
    seen.add(dedup);
  }
  const e = mem.get(k) ?? { count: 0, sampleIds: [] };
  e.count++;
  if (requestId && e.sampleIds.length < MAX_IDS) e.sampleIds.push(requestId);
  mem.set(k, e);
  const work = redisRecord(todayUTC(), reason, requestId).catch(() => {});
  try {
    waitUntil(work);
  } catch {}
}

async function redisRecord(day: string, reason: string, id?: string): Promise<void> {
  const env = redisEnv();
  if (!env) return;
  const base = `neville:fail:${day}:${reason}`;
  const cmds: (string | number)[][] = [
    ["INCR", `${base}:n`],
    ["EXPIRE", `${base}:n`, TTL_SEC, "NX"],
    ["SADD", `neville:fail:${day}:reasons`, reason],
    ["EXPIRE", `neville:fail:${day}:reasons`, TTL_SEC, "NX"],
  ];
  if (id) {
    cmds.push(["RPUSH", `${base}:ids`, id]);
    cmds.push(["LTRIM", `${base}:ids`, `-${MAX_IDS}`, "-1"]);
    cmds.push(["EXPIRE", `${base}:ids`, TTL_SEC, "NX"]);
  }
  const res = await fetch(`${env.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
}

export async function failureSummaryRedis(day: string): Promise<DaySummary | null> {
  const env = redisEnv();
  if (!env) return null;
  const r1 = await fetch(`${env.url}/smembers/neville:fail:${encodeURIComponent(day)}:reasons`, {
    headers: { Authorization: `Bearer ${env.token}` },
    signal: AbortSignal.timeout(2000),
  });
  if (!r1.ok) return null;
  const { result: reasons } = (await r1.json()) as { result?: string[] };
  if (!reasons?.length) return {};
  const cmds = reasons.flatMap((r) => [
    ["GET", `neville:fail:${day}:${r}:n`],
    ["LRANGE", `neville:fail:${day}:${r}:ids`, "0", "-1"],
  ]);
  const r2 = await fetch(`${env.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
    signal: AbortSignal.timeout(2000),
  });
  if (!r2.ok) return null;
  const replies = (await r2.json()) as Array<{ result: unknown }>;
  const out: DaySummary = {};
  reasons.forEach((r, i) => {
    out[r] = {
      count: Number(replies[i * 2]?.result ?? 0),
      sampleIds: (replies[i * 2 + 1]?.result as string[] | null) ?? [],
    };
  });
  return out;
}

export function failureSummaryMemory(): Record<string, DaySummary> {
  const out: Record<string, DaySummary> = {};
  for (const [k, v] of mem) {
    const sep = k.indexOf(":");
    const day = k.slice(0, sep);
    const reason = k.slice(sep + 1);
    if (!out[day]) out[day] = {};
    out[day][reason] = { count: v.count, sampleIds: [...v.sampleIds] };
  }
  return out;
}

/** For tests. */
export function resetFailureStore(): void {
  mem.clear();
  seen.clear();
}
