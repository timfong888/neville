// Which sign-in providers an environment has, and what accounts still need. Plain logic, no server-only
// import, so tests can run it. Google and Apple are each optional; accounts need at least one.

export const ACCOUNT_BASE_VARS = ["DATABASE_URL", "BLOB_READ_WRITE_TOKEN", "BETTER_AUTH_SECRET"] as const;

type Env = Record<string, string | undefined>;
const has = (env: Env, k: string) => Boolean(env[k]?.trim());

/** Google is offered only when both its variables are set. */
export function googleConfigured(env: Env = process.env): boolean {
  return has(env, "GOOGLE_CLIENT_ID") && has(env, "GOOGLE_CLIENT_SECRET");
}

/** Sign-in buttons to show, in order. `appleReady` is whether Apple's four variables are set and its key is usable. */
export function providersFor(env: Env, appleReady: boolean): ("google" | "apple")[] {
  return [...(googleConfigured(env) ? (["google"] as const) : []), ...(appleReady ? (["apple"] as const) : [])];
}

/** Names (never values) of what accounts still need; empty means accounts can turn on. */
export function missingAccountVars(env: Env, appleReady: boolean): string[] {
  const missing: string[] = ACCOUNT_BASE_VARS.filter((k) => !has(env, k));
  if (!googleConfigured(env) && !appleReady) missing.push("a sign-in provider (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or the four APPLE_ variables)");
  if (env.ACCOUNTS_ENABLED?.trim().toLowerCase() !== "true") missing.unshift("ACCOUNTS_ENABLED=true");
  return missing;
}
