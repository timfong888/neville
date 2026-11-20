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

/** True when the cookie matches the current ADMIN_TOKEN. Changing the token signs everyone out. */
export function isAdminCookie(value: string | undefined): boolean {
  const t = adminToken();
  return !!t && sameSecret(value ?? "", adminCookieValue(t));
}
