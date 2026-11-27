// Adult tier: kill switch and email allowlist. Server-only.
// ADULT_TIER_ENABLED=true (env) must be set to enable the tier globally.
// ADULT_TIER_EMAILS is a comma-separated list of verified email addresses.
// Both must be set for isAdultTierUser to return true.
import "server-only";

/** True when the adult tier is on globally (kill switch). Off by default. */
export function adultTierEnabled(): boolean {
  return process.env.ADULT_TIER_ENABLED?.trim().toLowerCase() === "true";
}

function parsedEmails(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
}

/**
 * True when the tier is on (kill switch) AND the email is in the allowlist.
 * Never logs the email.
 */
export function isAdultTierUser(email: string | null | undefined): boolean {
  if (!adultTierEnabled()) return false;
  if (!email) return false;
  return parsedEmails(process.env.ADULT_TIER_EMAILS).has(email.trim().toLowerCase());
}
