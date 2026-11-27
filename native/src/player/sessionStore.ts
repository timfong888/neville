// Persistent session-length preference (#236). Framework-free.
import type { KV } from "../seams/kv.types";
import {
  DEFAULT_LOOPS,
  DEFAULT_SESSION_MODE,
  DEFAULT_TIME,
  MAX_LOOPS,
  SESSION_MODES,
  TIME_OPTIONS,
  type SessionMode,
} from "@/lib/session/planSession";

export type { SessionMode };
export { SESSION_MODES, TIME_OPTIONS, MAX_LOOPS, DEFAULT_LOOPS, DEFAULT_TIME, DEFAULT_SESSION_MODE };

export const SESSION_MODE_KEY = "nvn_session_mode";
export const SESSION_TARGET_KEY = "nvn_session_target";

export function parseSessionMode(v: string | null | undefined): SessionMode {
  return SESSION_MODES.find((m) => m === v) ?? DEFAULT_SESSION_MODE;
}

export function parseSessionTarget(v: string | null | undefined, mode: SessionMode): number {
  const n = Number(v ?? "");
  if (!Number.isFinite(n) || n <= 0) return mode === "loops" ? DEFAULT_LOOPS : DEFAULT_TIME;
  if (mode === "loops") return Math.max(1, Math.min(MAX_LOOPS, Math.round(n)));
  return n;
}

export function makeSessionStore(kv: KV) {
  return {
    async readMode(): Promise<SessionMode> {
      return parseSessionMode(await kv.get(SESSION_MODE_KEY));
    },
    async readTarget(mode: SessionMode): Promise<number> {
      return parseSessionTarget(await kv.get(SESSION_TARGET_KEY), mode);
    },
    writeMode: (mode: SessionMode): Promise<boolean> => kv.set(SESSION_MODE_KEY, mode),
    writeTarget: (target: number): Promise<boolean> => kv.set(SESSION_TARGET_KEY, String(target)),
  };
}
