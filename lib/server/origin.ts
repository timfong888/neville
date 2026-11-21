// Same-site guard for state-changing requests to the account and library APIs.
// A cross-site form or fetch carries the attacker's Origin; one with no Origin
// at all is refused too, so this does not lean on SameSite cookies alone.
import { LEGACY_ORIGINS, PRIMARY_ORIGIN } from "@/lib/server/accounts";

/** Origins allowed to change account data: this deployment, production, and the old production host. */
export function allowedOrigins(req: Request): Set<string> {
  const set = new Set<string>([new URL(req.url).origin, PRIMARY_ORIGIN, ...LEGACY_ORIGINS]);
  const configured = process.env.BETTER_AUTH_URL?.trim();
  if (configured) {
    try {
      set.add(new URL(configured).origin);
    } catch {
      /* not a URL; ignore */
    }
  }
  return set;
}

/** True for GET/HEAD, or when the request's Origin header is present and allowed. */
export function sameSiteRequest(req: Request): boolean {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const origin = req.headers.get("origin");
  return !!origin && allowedOrigins(req).has(origin);
}
