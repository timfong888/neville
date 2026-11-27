import "server-only";
import { captureEvent } from "@/lib/server/telemetry";
import { recordFailure } from "@/lib/server/failureStore";

export type AlertKind = "script_failed" | "voice_failed" | "manifest_timeout";

type SafeFields = {
  route: string;
  reason?: string;
  model?: string | null;
  provider?: string;
  voice?: string;
  chunkIndex?: number;
  status?: number;
  elapsedMs?: number;
  requestId?: string;
};

function providerOf(model: string | null | undefined): string | undefined {
  if (!model) return undefined;
  const slash = model.indexOf("/");
  return slash > 0 ? model.slice(0, slash) : undefined;
}

const BUILD = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);

export function alertFailure(kind: AlertKind, fields: SafeFields): void {
  const provider = fields.provider ?? providerOf(fields.model);
  const enriched = {
    ...fields,
    ...(provider ? { provider } : {}),
    ...(BUILD ? { build: BUILD } : {}),
  };
  console.error("[ALERT]", kind, JSON.stringify(enriched));
  captureEvent(kind, enriched);
  recordFailure(`${kind}:${fields.reason ?? "unknown"}`, fields.requestId);
}
