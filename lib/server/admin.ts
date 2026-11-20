// The admin page's sign-in: ADMIN_TOKEN entered once in a form, then an
// httpOnly cookie holding a signed session: "<iat>.<exp>.<hmac>". The HMAC
// key is derived from ADMIN_TOKEN, so changing the token signs everyone out,
// and the expiry is checked on the server, not only by the browser's Max-Age.
// The token never goes in a URL or in the cookie.
import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { sameSecret } from "@/lib/ledger";

export const ADMIN_COOKIE = "nv_admin";

export function adminToken(): string {
  return process.env.ADMIN_TOKEN?.trim() ?? "";
}

/** How long an admin session lasts, enforced on the server. */
export const SESSION_SECONDS = 12 * 60 * 60;

const digest = (token: string) => createHash("sha256").update(`neville-admin:${token}`, "utf8").digest("hex");
const signingKey = (token: string) => createHash("sha256").update(`neville-admin-session:${token}`, "utf8").digest();
const sign = (token: string, payload: string) => createHmac("sha256", signingKey(token)).update(payload, "utf8").digest("hex");

/** A new session cookie value: issued-at and expiry (Unix seconds), signed. */
export function adminCookieValue(token: string, nowMs = Date.now()): string {
  const iat = Math.floor(nowMs / 1000);
  const payload = `${iat}.${iat + SESSION_SECONDS}`;
  return `${payload}.${sign(token, payload)}`;
}

/** Compares a typed token with ADMIN_TOKEN through their hashes, so neither length nor content leaks by timing. */
export function tokenMatches(given: string): boolean {
  const t = adminToken();
  return !!t && !!given && sameSecret(digest(given), digest(t));
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

/** A correct login clears the visitor's wrong guesses. */
export function clearFailedLogins(ip: string) {
  fails.delete(ip);
}

/** For tests. */
export function resetLoginFailures() {
  fails.clear();
}

/**
 * True when the cookie is a session signed with the current ADMIN_TOKEN and
 * not expired. Checks the signature in constant time, then that it was issued
 * no later than now (a minute's clock skew allowed), expires after now, and
 * lasts no longer than SESSION_SECONDS.
 */
export function isAdminCookie(value: string | undefined, nowMs = Date.now()): boolean {
  const t = adminToken();
  if (!t || !value) return false;
  const m = /^(\d{1,12})\.(\d{1,12})\.([0-9a-f]{64})$/.exec(value);
  if (!m) return false;
  const [, iatS, expS, mac] = m;
  const want = Buffer.from(sign(t, `${iatS}.${expS}`), "hex");
  const got = Buffer.from(mac, "hex");
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
  const now = Math.floor(nowMs / 1000);
  const iat = Number(iatS);
  const exp = Number(expS);
  return iat <= now + 60 && exp > now && exp - iat <= SESSION_SECONDS;
}
