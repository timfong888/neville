import "server-only";
import { captureEvent } from "@/lib/server/telemetry";

export type AttemptLogger = {
  info(tag: string, fields?: Record<string, unknown>): void;
  warn(tag: string, fields?: Record<string, unknown>): void;
  error(tag: string, fields?: Record<string, unknown>): void;
  event(kind: string, fields?: Record<string, unknown>): void;
};

/** Returns a logger that stamps every call with attempt_id (and build when provided). */
export function forAttempt(attemptId: string, build?: string): AttemptLogger {
  const ctx: Record<string, unknown> = { attempt_id: attemptId };
  if (build) ctx.build = build;
  const stamp = (fields: Record<string, unknown> = {}) => ({ ...ctx, ...fields });
  return {
    info(tag, fields) { console.info(tag, JSON.stringify(stamp(fields))); },
    warn(tag, fields) { console.warn(tag, JSON.stringify(stamp(fields))); },
    error(tag, fields) { console.error(tag, JSON.stringify(stamp(fields))); },
    event(kind, fields) { captureEvent(kind, stamp(fields)); },
  };
}
