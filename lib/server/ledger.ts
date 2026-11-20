// Records every paid generation and raises budget alerts.
//
// THE SEAM: everything goes through `LedgerStore`. Today's store keeps the
// most recent entries in this server instance's memory and writes each entry
// as one `[ledger]` JSON line to the runtime log, which is the durable record
// (Vercel: project, Logs, search "[ledger]"). A Postgres table (once #18's
// database exists) or an Upstash list can implement the same interface and be
// passed to `setLedger`. No store was added here: that needs Tim.
//
// Budget alerts read OpenRouter's own usage counter for the key, the same
// number the spend ceiling uses, so the percentage holds across instances.
// Which levels were already alerted is remembered per instance, so each
// instance that sees a level alerts it once.
import "server-only";
import limits from "@/config/limits.json";
import { type AlertLevel, type LedgerEntry, newAlert, speechCost } from "@/lib/ledger";
import { listSpeechModels } from "@/lib/server/openrouter";

export interface LedgerStore {
  append(e: LedgerEntry): Promise<void>;
  /** Newest first. */
  recent(limit: number): Promise<LedgerEntry[]>;
  /** Where the entries live, shown on the admin page. */
  readonly scope: string;
}

const KEEP = 500;

export class MemoryLedger implements LedgerStore {
  readonly scope = "This server instance since it last started. The full record is the [ledger] lines in the runtime log.";
  private entries: LedgerEntry[] = [];
  async append(e: LedgerEntry) {
    this.entries.unshift(e);
    if (this.entries.length > KEEP) this.entries.length = KEEP;
  }
  async recent(limit: number) {
    return this.entries.slice(0, limit);
  }
}

let store: LedgerStore = new MemoryLedger();
export function ledger(): LedgerStore {
  return store;
}
/** For tests, and for a durable store later. */
export function setLedger(s: LedgerStore) {
  store = s;
}

/** Records one paid call. Never throws: a ledger failure must not fail the request. */
export async function record(e: Omit<LedgerEntry, "at">): Promise<void> {
  const entry: LedgerEntry = { at: Date.now(), ...e };
  console.info("[ledger]", JSON.stringify(entry));
  try {
    await store.append(entry);
  } catch {
    /* the log line above is still the record */
  }
}

/** Estimated cost of `chars` characters of speech in `model`; null when not priced per character. */
export async function estimateSpeech(model: string, chars: number): Promise<number | null> {
  try {
    const { models } = await listSpeechModels();
    return speechCost(chars, models.find((m) => m.id === model)?.usdPerMChars);
  } catch {
    return null;
  }
}

let alerted = 0;
let lastUsage: { usage: number; at: number } | null = null;

/** The last usage figure this instance read from OpenRouter, for the admin page. */
export function lastSeenUsage() {
  return lastUsage;
}

/**
 * Call with the key's usage each time it is read. At 50, 80 and 100% of
 * `spendCeilingUsd` it logs a `[budget-alert]` line and, if
 * `ALERT_WEBHOOK_URL` is set, POSTs a JSON message there (`text` and
 * `content` fields, so a Slack or Discord incoming webhook works as is).
 * Returns the level alerted, if any. Never throws.
 */
export async function checkBudget(usage: number): Promise<AlertLevel | null> {
  lastUsage = { usage, at: Date.now() };
  const level = newAlert(alerted, usage, limits.spendCeilingUsd);
  if (level === null) return null;
  alerted = level;
  const ceiling = limits.spendCeilingUsd;
  const text =
    `Neville: OpenRouter spend is at ${level}% of the $${ceiling.toFixed(2)} ceiling ($${usage.toFixed(4)} used).` +
    (level >= 100 ? " Recording has stopped." : "");
  console.warn("[budget-alert]", JSON.stringify({ level, usage, ceiling }));
  const url = process.env.ALERT_WEBHOOK_URL?.trim();
  if (url) {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, content: text, level, usage, ceiling }),
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      console.warn("[budget-alert] webhook failed");
    }
  }
  return level;
}

/** For tests. */
export function resetAlerts() {
  alerted = 0;
  lastUsage = null;
}
