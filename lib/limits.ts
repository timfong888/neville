// Limit decisions for recording. Framework-free: no Next, React or browser
// APIs. The numbers are in config/limits.json.
//
// HARD CAP: budgetVerdict, the spend ceiling. OpenRouter keeps the count, so it
// holds everywhere.
// SOFT MVP CAPS: takeSlot's per-visitor and per-day counters. They live in this
// module's memory, one copy per server instance, and are lost on restart. They
// slow casual overuse; they do not bound spend. Durable counters need a store
// and are tracked in issue #8.
import limits from "@/config/limits.json";

const today = () => new Date().toISOString().slice(0, 10);
let day = today();
let total = 0;
const perIp = new Map<string, number>();

function roll() {
  const t = today();
  if (t !== day) {
    day = t;
    total = 0;
    perIp.clear();
  }
}

export type Refusal = { status: number; code: string; error: string };

/** Counts one request against the visitor and the day. Returns a refusal when over. */
export function takeSlot(ip: string): Refusal | null {
  roll();
  if (total >= limits.globalPerDay) {
    return { status: 429, code: "day_full", error: "Today's free recordings are used up. Try again tomorrow." };
  }
  const used = perIp.get(ip) ?? 0;
  if (used >= limits.perIpPerDay) {
    return { status: 429, code: "visitor_full", error: "You have used today's free recordings." };
  }
  if (perIp.size > 5000) perIp.clear(); // keep memory bounded
  perIp.set(ip, used + 1);
  total++;
  return null;
}

/** Gives a slot back when nothing was spent. */
export function returnSlot(ip: string) {
  const used = perIp.get(ip) ?? 0;
  if (used > 0) perIp.set(ip, used - 1);
  if (total > 0) total--;
}

/** Null while there is budget left; a refusal once the key's usage reaches the ceiling or its credit runs out. */
export function budgetVerdict(usage: number, limitRemaining: number | null | undefined): Refusal | null {
  const spent = usage >= limits.spendCeilingUsd;
  const empty = typeof limitRemaining === "number" && limitRemaining <= 0.02;
  return spent || empty
    ? { status: 429, code: "budget_spent", error: "The free recording budget is used up for now." }
    : null;
}
