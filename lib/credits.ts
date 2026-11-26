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

/**
 * True when the signed-in account's own email is on the list. The user comes from the server-side session,
 * never from the request body or headers. An email the sign-in provider did not verify never counts.
 */
export function isUnlimited(
  user: { email?: string | null; emailVerified?: boolean } | null | undefined,
  raw: string | undefined = process.env.UNLIMITED_USER_EMAILS,
): boolean {
  if (!user?.email || user.emailVerified !== true) return false;
  return unlimitedEmails(raw).has(user.email.trim().toLowerCase());
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
