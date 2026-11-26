// Credits (#168): config and pure rules, shared by the routes. No database here.
import config from "@/config/credits.json";

export const CREDITS = config;
export type ProductId = keyof typeof config.products;

/** The paywall is off unless PAYWALL_ENABLED is exactly "true", so the live app keeps working until it is switched on. */
export function paywallEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.PAYWALL_ENABLED?.trim().toLowerCase() === "true";
}

/** UNLIMITED_USER_EMAILS: a comma list, compared in lower case. */
export function unlimitedEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** UNLIMITED_USER_IDS: a comma list of Better Auth user ids, for accounts whose email is not usable (Apple private relay). */
export function unlimitedIds(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean),
  );
}

/**
 * True when the signed-in account is a tester: its id is on UNLIMITED_USER_IDS, or its own email is on
 * UNLIMITED_USER_EMAILS and the sign-in provider verified it. The user comes from the server-side session,
 * never from the request body or headers.
 */
export function isUnlimited(
  user: { id?: string | null; email?: string | null; emailVerified?: boolean } | null | undefined,
  rawEmails: string | undefined = process.env.UNLIMITED_USER_EMAILS,
  rawIds: string | undefined = process.env.UNLIMITED_USER_IDS,
): boolean {
  if (!user) return false;
  if (user.id && unlimitedIds(rawIds).has(user.id)) return true;
  if (!user.email || user.emailVerified !== true) return false;
  return unlimitedEmails(rawEmails).has(user.email.trim().toLowerCase());
}

export type Pack = { id: string; credits: number };

/** The packs an account may buy: starter only while it has never bought it. */
export function availablePacks(boughtStarter: boolean): Pack[] {
  return Object.entries(config.products)
    .filter(([, p]) => !(p.oncePerAccount && boughtStarter))
    .map(([id, p]) => ({ id, credits: p.credits }));
}

export function productOf(id: string): { credits: number; oncePerAccount: boolean } | null {
  return Object.hasOwn(config.products, id) ? config.products[id as ProductId] : null;
}

export type Action = keyof typeof config.costs;

/** What an action costs, in credits, from config/credits.json. */
export function costOf(action: Action): number {
  return config.costs[action];
}
