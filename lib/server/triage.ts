import "server-only";
import type { DaySummary } from "@/lib/server/failureStore";
import { redisEnv } from "@/lib/server/redis";

const REPO = "timfong888/neville";
const LABEL = "auto-triage";
const TITLE_PREFIX = "[auto-triage]";

export type TriageResult = {
  created: Array<{ reason: string; issueUrl: string; issueNumber: number }>;
  skipped: Array<{ reason: string; existingUrl: string }>;
};

/** Existing open auto-triage issues, keyed by their reason slug. Follows Link pagination. */
async function existingIssues(token: string): Promise<Map<string, { url: string; number: number }>> {
  const map = new Map<string, { url: string; number: number }>();
  let next: string | null =
    `https://api.github.com/repos/${REPO}/issues?labels=${LABEL}&state=open&per_page=100`;

  while (next) {
    // eslint-disable-next-line no-await-in-loop
    const pageRes: Response = await fetch(next, {
      headers: { Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(5000),
    });
    if (!pageRes.ok) throw new Error(`github list issues ${pageRes.status}`);
    const issues = (await pageRes.json()) as Array<{ title: string; html_url: string; number: number }>;
    for (const issue of issues) {
      // Title format: "[auto-triage] voice_failed:http_status (3 failures on 2026-11-27)"
      const m = /^\[auto-triage\] (.+?) \(/.exec(issue.title);
      if (m) map.set(m[1], { url: issue.html_url, number: issue.number });
    }
    // Follow the next page link, if any
    const linkHeader: string = pageRes.headers.get("link") ?? "";
    next = /<([^>]+)>; rel="next"/.exec(linkHeader)?.[1] ?? null;
  }
  return map;
}

async function createIssue(
  token: string,
  reason: string,
  entry: DaySummary[string],
  day: string,
): Promise<{ url: string; number: number }> {
  const title = `${TITLE_PREFIX} ${reason} (${entry.count} failure${entry.count === 1 ? "" : "s"} on ${day})`;
  const sampleLines =
    entry.sampleIds.length > 0
      ? `**Sample request IDs:** ${entry.sampleIds.join(", ")}`
      : "_No request IDs recorded._";
  const body = [
    `## Auto-triage: \`${reason}\``,
    "",
    `**Failures on ${day}:** ${entry.count}`,
    sampleLines,
    "",
    `_Opened automatically by the triage endpoint. Label: \`${LABEL}\`._`,
    `_To suppress: close this issue before the next triage run._`,
  ].join("\n");

  const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ title, body, labels: [LABEL] }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`github create issue ${res.status}`);
  const created = (await res.json()) as { html_url: string; number: number };
  return { url: created.html_url, number: created.number };
}

/**
 * Acquire a per-day/reason lock in Redis using SET NX to prevent two concurrent
 * triage calls from both passing the existingIssues() check and each creating a
 * duplicate GitHub issue for the same reason.
 *
 * Returns true when the lock is acquired or when Redis is not configured
 * (best-effort degradation). Returns false when another instance holds the lock.
 */
async function claimTriageLock(day: string, reason: string): Promise<boolean> {
  const env = redisEnv();
  if (!env) return true;
  try {
    const key = `neville:triage:lock:${day}:${reason}`;
    const res = await fetch(`${env.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.token}`, "Content-Type": "application/json" },
      body: JSON.stringify([["SET", key, "1", "NX", "EX", "3600"]]),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return true; // Redis error: proceed optimistically
    const replies = (await res.json()) as Array<{ result: string | null }>;
    return replies[0]?.result === "OK";
  } catch {
    return true; // On error, proceed optimistically rather than blocking triage
  }
}

export async function runTriage(summary: DaySummary, day: string): Promise<TriageResult> {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new Error("GITHUB_TOKEN not set");

  const existing = await existingIssues(token);
  const result: TriageResult = { created: [], skipped: [] };

  for (const [reason, entry] of Object.entries(summary)) {
    if (existing.has(reason)) {
      const ex = existing.get(reason)!;
      result.skipped.push({ reason, existingUrl: ex.url });
      continue;
    }
    // Guard against two concurrent requests both passing the existingIssues check
    // eslint-disable-next-line no-await-in-loop
    const claimed = await claimTriageLock(day, reason);
    if (!claimed) continue; // Another concurrent request is creating this issue
    const issue = await createIssue(token, reason, entry, day);
    result.created.push({ reason, issueUrl: issue.url, issueNumber: issue.number });
  }
  return result;
}
