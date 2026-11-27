import "server-only";

export type SafeProps = {
  route?: string;
  reason?: string;
  model?: string | null;
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
  // Schedule with waitUntil when the Vercel runtime provides it, so the
  // response is not held open but the POST is still delivered; otherwise the
  // .catch() above already makes this fire-and-forget.
  import("@vercel/functions")
    .then((m) => (m as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil?.(work))
    .catch(() => {});
}
