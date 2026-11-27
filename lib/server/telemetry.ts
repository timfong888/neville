import "server-only";
import { waitUntil } from "@vercel/functions";

export type SafeProps = {
  route?: string;
  reason?: string;
  model?: string | null;
  status?: number;
  elapsedMs?: number;
  requestId?: string;
  build?: string;
  attempt_id?: string;
  step?: string;
  try?: number;
};

// Dedup: skip if the same attempt+step+try+event was already sent in this process instance.
const sentKeys = new Set<string>();

function dedupKey(event: string, p: SafeProps): string | null {
  if (!p.attempt_id) return null;
  return `${p.attempt_id}\x00${p.step ?? ""}\x00${p.try ?? 0}\x00${event}`;
}

/** Clears dedup state between tests. */
export function resetSentKeys(): void { sentKeys.clear(); }

export function captureEvent(event: string, properties: SafeProps): void {
  const dk = dedupKey(event, properties);
  if (dk) {
    if (sentKeys.has(dk)) return;
    sentKeys.add(dk);
  }
  const key = process.env.POSTHOG_KEY;
  if (!key) return;
  const work = Promise.resolve()
    .then(() =>
      fetch("https://us.i.posthog.com/capture/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: key, event, distinct_id: "server", properties }),
        signal: AbortSignal.timeout(2000),
      }),
    )
    .catch(() => {});
  try {
    waitUntil(work);
  } catch {
    // waitUntil unavailable outside a Vercel request context; work is already fire-and-forget
  }
}
