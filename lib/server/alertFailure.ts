import "server-only";
import { captureEvent } from "@/lib/server/telemetry";

export type AlertKind = "script_failed" | "voice_failed" | "manifest_timeout";

type SafeFields = {
  route: string;
  reason?: string;
  model?: string | null;
  status?: number;
  elapsedMs?: number;
  requestId?: string;
};

export function alertFailure(kind: AlertKind, fields: SafeFields): void {
  console.error("[ALERT]", kind, JSON.stringify(fields));
  captureEvent(kind, fields);
}
