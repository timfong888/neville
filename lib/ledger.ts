// Usage ledger and budget alert decisions. Framework-free: no Next, React or
// browser APIs, so tests and a later database-backed store can share it.

export type LedgerKind = "script" | "vet" | "speech";

/** One paid call to OpenRouter. */
export type LedgerEntry = {
  at: number;
  route: "manifest" | "rerecord" | "expand";
  kind: LedgerKind;
  /** OpenRouter model id; null when the call fell back without a model. */
  model: string | null;
  voiceId?: string;
  /** Characters sent (speech, vet) or returned (script). */
  chars: number;
  /** Estimated cost in USD; null when the price is not per character or unknown. */
  estUsd: number | null;
  /** False when the call failed; it may still have been billed in part. */
  ok?: boolean;
};

/** Budget levels that raise an alert, in percent of the spend ceiling. */
export const ALERT_LEVELS = [50, 80, 100] as const;
export type AlertLevel = (typeof ALERT_LEVELS)[number];

/** The highest alert level reached, or 0 below the first. */
export function budgetLevel(usage: number, ceiling: number): 0 | AlertLevel {
  if (!(ceiling > 0) || !Number.isFinite(usage)) return 0;
  const pct = (usage / ceiling) * 100;
  let level: 0 | AlertLevel = 0;
  for (const l of ALERT_LEVELS) if (pct >= l) level = l;
  return level;
}

/** The level to alert on now, or null if it was already alerted or none is reached. */
export function newAlert(prev: number, usage: number, ceiling: number): AlertLevel | null {
  const level = budgetLevel(usage, ceiling);
  return level > prev ? (level as AlertLevel) : null;
}

/** USD for `chars` characters at a per-million-character price. */
export function speechCost(chars: number, usdPerMChars: number | null | undefined): number | null {
  return typeof usdPerMChars === "number" && usdPerMChars >= 0 ? (chars * usdPerMChars) / 1e6 : null;
}

export type Totals = { calls: number; chars: number; estUsd: number; unpriced: number; failed: number };

export function totals(entries: LedgerEntry[]): Totals {
  return entries.reduce<Totals>(
    (t, e) => ({
      calls: t.calls + 1,
      chars: t.chars + e.chars,
      estUsd: t.estUsd + (e.estUsd ?? 0),
      unpriced: t.unpriced + (e.estUsd === null ? 1 : 0),
      failed: t.failed + (e.ok === false ? 1 : 0),
    }),
    { calls: 0, chars: 0, estUsd: 0, unpriced: 0, failed: 0 },
  );
}

/** Constant-time comparison for the admin token. Empty never matches. */
export function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
