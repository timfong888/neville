// Revoking a Sign in with Apple grant when an account is deleted (App Review 5.1.1(v), #98).
// Apple revokes by token, not by user: a refresh or access token, sent with the client id it was
// issued to. The website's OAuth flow leaves such tokens in the "account" row. The iOS app signs in
// with an identity token only, so it sends a fresh authorization code with the delete request and
// this module exchanges it. Nothing here throws, and every call to Apple has a deadline: a failure
// to revoke must never stop the deletion.

/** A client id Apple knows us by (the web Services ID or the app's bundle id) and a secret signed for it. */
export type AppleClient = { clientId: string; clientSecret: string };

/** One Apple sign-in on the account: Apple's user id and whatever tokens the web flow stored. */
export type AppleLink = { accountId: string; refreshToken: string | null; accessToken: string | null };

export type RevokeOutcome = "revoked" | "failed" | "nothing-to-revoke";

const APPLE = "https://appleid.apple.com";
const DEADLINE_MS = 5000;
export const MAX_CODE_LENGTH = 1024;

async function post(doFetch: typeof fetch, path: string, form: Record<string, string>): Promise<Response | null> {
  try {
    return await doFetch(`${APPLE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(DEADLINE_MS),
    });
  } catch {
    return null;
  }
}

/** The `sub` claim of an identity token. Not verified: use only on a token Apple returned to us directly. */
export function appleSubject(idToken: unknown): string | null {
  try {
    const payload = JSON.parse(Buffer.from(String(idToken).split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Trades an authorization code for a refresh token and the Apple user it belongs to. */
export async function exchangeAppleCode(client: AppleClient, code: string, doFetch: typeof fetch = fetch): Promise<{ refreshToken: string; subject: string | null } | null> {
  const res = await post(doFetch, "/auth/token", { client_id: client.clientId, client_secret: client.clientSecret, grant_type: "authorization_code", code });
  if (!res?.ok) return null;
  const j = (await res.json().catch(() => null)) as { refresh_token?: unknown; id_token?: unknown } | null;
  return typeof j?.refresh_token === "string" ? { refreshToken: j.refresh_token, subject: appleSubject(j.id_token) } : null;
}

/** True when Apple accepted the revocation (it answers 200 with an empty body). */
export async function revokeAppleToken(client: AppleClient, token: string, hint: "refresh_token" | "access_token", doFetch: typeof fetch = fetch): Promise<boolean> {
  const res = await post(doFetch, "/auth/revoke", { client_id: client.clientId, client_secret: client.clientSecret, token, token_type_hint: hint });
  return !!res?.ok;
}

/** A code from the request body, or undefined unless it is a plausible one. */
export function readAppleCode(body: unknown): string | undefined {
  const c = (body as { appleAuthorizationCode?: unknown } | null)?.appleAuthorizationCode;
  return typeof c === "string" && c.length > 0 && c.length <= MAX_CODE_LENGTH ? c : undefined;
}

/**
 * Revokes what can be revoked for one account: the app's grant through a fresh authorization code
 * (only when the code belongs to the same Apple user as the account), and the website's grant
 * through its stored token. "failed" means at least one attempt did not go through.
 */
export async function revokeAppleGrants(opts: {
  links: AppleLink[];
  code?: string;
  web?: AppleClient | null;
  app?: AppleClient | null;
  fetch?: typeof fetch;
}): Promise<RevokeOutcome> {
  const doFetch = opts.fetch ?? fetch;
  if (!opts.links.length) return "nothing-to-revoke";
  const results: boolean[] = [];
  if (opts.code) {
    const got = opts.app ? await exchangeAppleCode(opts.app, opts.code, doFetch) : null;
    const mine = !!got && opts.links.some((l) => l.accountId === got.subject);
    results.push(mine && (await revokeAppleToken(opts.app!, got!.refreshToken, "refresh_token", doFetch)));
  }
  for (const l of opts.links) {
    const token = l.refreshToken ?? l.accessToken;
    if (!token) continue;
    results.push(!!opts.web && (await revokeAppleToken(opts.web, token, l.refreshToken ? "refresh_token" : "access_token", doFetch)));
  }
  if (!results.length) return "nothing-to-revoke";
  return results.every(Boolean) ? "revoked" : "failed";
}
