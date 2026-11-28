import "server-only";
import { waitUntil } from "@vercel/functions";

export type SafeProps = {
  route?: string;
  reason?: string;
  model?: string | null;
  provider?: string;
  voice?: string;
  chunkIndex?: number;
  status?: number;
  elapsedMs?: number;
  requestId?: string;
  build?: string;
};

export function captureEvent(event: string, properties: SafeProps): void {
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
