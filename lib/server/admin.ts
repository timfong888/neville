// The admin page's sign-in: ADMIN_TOKEN entered once in a form, then an
// httpOnly cookie holding a hash of it. The token never goes in a URL.
import "server-only";
import { createHash } from "node:crypto";
import { sameSecret } from "@/lib/ledger";

export const ADMIN_COOKIE = "nv_admin";

export function adminToken(): string {
  return process.env.ADMIN_TOKEN?.trim() ?? "";
}

/** What the cookie holds: a hash of ADMIN_TOKEN, never the token itself. */
export function adminCookieValue(token: string): string {
  return createHash("sha256").update(`neville-admin:${token}`, "utf8").digest("hex");
}

/** Compares a typed token with ADMIN_TOKEN through their hashes, so neither length nor content leaks by timing. */
export function tokenMatches(given: string): boolean {
  const t = adminToken();
  return !!t && !!given && sameSecret(adminCookieValue(given), adminCookieValue(t));
}

// Wrong guesses per visitor, in memory per instance. With a long random
// token guessing is hopeless anyway; this keeps a script from trying.
const MAX_FAILS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const fails = new Map<string, { n: number; since: number }>();

/** True when this visitor has made too many wrong guesses lately. */
export function loginBlocked(ip: string, now = Date.now()): boolean {
  const f = fails.get(ip);
  if (!f || now - f.since > WINDOW_MS) return false;
  return f.n >= MAX_FAILS;
}

export function noteFailedLogin(ip: string, now = Date.now()) {
  const f = fails.get(ip);
  if (!f || now - f.since > WINDOW_MS) fails.set(ip, { n: 1, since: now });
  else f.n++;
  if (fails.size > 5000) fails.clear();
}

/** For tests. */
export function resetLoginFailures() {
  fails.clear();
}

/** True when the cookie matches the current ADMIN_TOKEN. Changing the token signs everyone out. */
export function isAdminCookie(value: string | undefined): boolean {
  const t = adminToken();
  return !!t && sameSecret(value ?? "", adminCookieValue(t));
}
