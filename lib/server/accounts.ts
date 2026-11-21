// Accounts: Better Auth with Google sign-in, Neon Postgres, private Vercel Blob.
// Everything here is off unless every variable below is set, so a preview or
// production build without them behaves exactly as before (device storage).
import "server-only";
import { del, get, put } from "@vercel/blob";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { tryAppleClientSecret } from "@/lib/server/appleSecret";
import { getPool, withTx } from "@/lib/server/db";
import { sniffAudio } from "@/lib/server/audioSniff";
import { randomUUID } from "node:crypto";
import { addTombstones, type Db, oldestTombstones } from "@/lib/server/libraryDb";

const REQUIRED = [
  "DATABASE_URL",
  "BLOB_READ_WRITE_TOKEN",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "BETTER_AUTH_SECRET",
] as const;

/** Names of the variables still missing, for the status page. Never their values. */
export function missingVars(): string[] {
  const missing: string[] = REQUIRED.filter((k) => !process.env[k]?.trim());
  if (process.env.ACCOUNTS_ENABLED?.trim().toLowerCase() !== "true") missing.unshift("ACCOUNTS_ENABLED=true");
  return missing;
}

export function accountsEnabled(): boolean {
  return missingVars().length === 0;
}

export { withTx };

// The production site. The OAuth redirect URIs registered with Google (and
// Apple) are built from it, so production always uses this one host rather
// than whichever domain Vercel happens to report.
export const PRIMARY_ORIGIN = "https://getneville.vercel.app";
// The earlier production host; it now redirects to PRIMARY_ORIGIN but stays trusted.
export const LEGACY_ORIGINS = ["https://neville-delta.vercel.app"];

function baseURL(): string | undefined {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_ENV === "production") return PRIMARY_ORIGIN;
  if (process.env.VERCEL_BRANCH_URL) return `https://${process.env.VERCEL_BRANCH_URL}`;
  return undefined;
}

// The Apple client secret is a JWT that expires (150 days); the auth instance
// and the secret are rebuilt weekly so a long-lived server never holds an expired one.
const AUTH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const APPLE_VARS = ["APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"] as const;

/** An Apple variable with surrounding whitespace removed (pasted values often end in a newline). */
function appleVar(k: (typeof APPLE_VARS)[number]): string {
  return process.env[k]?.trim() ?? "";
}

/**
 * The Apple client secret, or null when Apple is not configured or its key
 * does not parse. Computed per auth build. A bad key only switches Apple off,
 * with one log line naming the variable; Google sign-in keeps working.
 */
let appleKeyWarned = false;
let appleCache: { secret: string | null; at: number } | null = null;
function appleSecret(): string | null {
  // Signed once and reused until the auth instance is rebuilt, so status
  // requests do not parse the key and sign a JWT each time.
  if (appleCache && Date.now() - appleCache.at <= AUTH_MAX_AGE_MS) return appleCache.secret;
  let secret: string | null = null;
  if (APPLE_VARS.every((k) => appleVar(k))) {
    secret = tryAppleClientSecret({
      teamId: appleVar("APPLE_TEAM_ID"),
      keyId: appleVar("APPLE_KEY_ID"),
      clientId: appleVar("APPLE_CLIENT_ID"),
      privateKey: appleVar("APPLE_PRIVATE_KEY"),
    });
    if (!secret && !appleKeyWarned) {
      appleKeyWarned = true;
      console.error("Sign in with Apple is off: APPLE_PRIVATE_KEY could not be read as a .p8 private key.");
    }
  }
  appleCache = { secret, at: Date.now() };
  return secret;
}

/** Sign in with Apple is offered only when all four Apple variables are set and the key is usable. Google stays required. */
export function appleEnabled(): boolean {
  return appleSecret() !== null;
}

/** Sign-in buttons to show: Google always, Apple when configured. */
export function signInProviders(): ("google" | "apple")[] {
  return appleEnabled() ? ["google", "apple"] : ["google"];
}

function appleProvider() {
  const clientSecret = appleSecret();
  if (!clientSecret) return {};
  const clientId = appleVar("APPLE_CLIENT_ID");
  const bundleId = process.env.APPLE_APP_BUNDLE_ID?.trim();
  return {
    apple: {
      clientId,
      clientSecret,
      // For the future iOS app: accept ID tokens issued to its bundle id as well
      // as to the web Services ID. Better Auth's appBundleIdentifier would
      // replace the Services ID as the audience, so list both explicitly.
      ...(bundleId ? { audience: [clientId, bundleId] } : {}),
    },
  };
}

let authBuiltAt = 0;
let auth: ReturnType<typeof makeAuth> | null = null;
function makeAuth() {
  const apple = appleProvider();
  return betterAuth({
    database: getPool(),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: baseURL(),
    // Google only at MVP (architecture spec): no passwords, no email service.
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      },
      ...apple,
    },
    // Apple returns to the callback with a form POST from its own origin.
    trustedOrigins: [PRIMARY_ORIGIN, ...LEGACY_ORIGINS, ...("apple" in apple ? ["https://appleid.apple.com"] : [])],
    plugins: [nextCookies()],
  });
}

/** The Better Auth instance. Call only when accountsEnabled() is true. */
export function getAuth() {
  if (!accountsEnabled()) throw new Error("Accounts are not enabled.");
  if (!auth || Date.now() - authBuiltAt > AUTH_MAX_AGE_MS) {
    appleCache = null; // sign a fresh Apple secret for the new instance
    auth = makeAuth();
    authBuiltAt = Date.now();
  }
  return auth;
}

export type SignedIn = { id: string; name: string; email: string; image: string | null };

/** The signed-in user for this request, or null (also null when accounts are off). */
export async function currentUser(req: Request): Promise<SignedIn | null> {
  if (!accountsEnabled()) return null;
  const s = await getAuth().api.getSession({ headers: req.headers });
  if (!s?.user) return null;
  return { id: s.user.id, name: s.user.name, email: s.user.email, image: s.user.image ?? null };
}

// Recordings live in a private Blob store and are only served through the
// app after an ownership check, never by their storage URL.
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

/** The file's real type from its bytes, or null when it is not WAV or MP3. */
export async function audioType(file: Blob): Promise<"audio/wav" | "audio/mpeg" | null> {
  return sniffAudio(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
}

/**
 * Picks a storage key for a new recording and records it in blob_tombstone
 * (committed at once) before anything is uploaded. Call it, and upload,
 * before opening the save transaction: neither should hold a connection. The caller clears that
 * record in the same transaction that saves the row pointing at the file, so
 * an upload whose row never commits is still known and gets removed.
 */
export async function reserveAudioKey(userId: string, mime: "audio/wav" | "audio/mpeg"): Promise<string> {
  // Ownership lives in the database row, not the path; the user id only groups files.
  const key = `audio/${userId}/${randomUUID()}.${mime === "audio/mpeg" ? "mp3" : "wav"}`;
  await addTombstones(getPool() as unknown as Db, [key], "upload");
  return key;
}

/** Uploads to a key from reserveAudioKey(); the type was already checked with audioType(). */
export async function storeAudio(key: string, file: Blob, mime: "audio/wav" | "audio/mpeg"): Promise<{ key: string; mime: string }> {
  await put(key, file, { access: "private", addRandomSuffix: false, contentType: mime });
  return { key, mime };
}

export async function readAudio(key: string): Promise<ReadableStream<Uint8Array> | null> {
  const r = await get(key, { access: "private" });
  return r && r.statusCode === 200 ? r.stream : null;
}

/**
 * Removes recordings whose keys are already recorded in blob_tombstone, then
 * clears those records. If Blob fails, the records stay and a later call
 * retries them, so nothing is ever forgotten. Returns how many are still pending.
 */
export async function purgeAudio(keys: string[]): Promise<number> {
  let pending = 0;
  const run = async (batch: string[]) => {
    if (!batch.length) return;
    try {
      await del(batch);
      await getPool().query(`delete from blob_tombstone where key = any($1::text[])`, [batch]);
    } catch (e) {
      pending += batch.length;
      console.error("blob delete failed; will retry", batch.length, e instanceof Error ? e.message : e);
    }
  };
  await run(keys);
  // Retry older leftovers from earlier failures, a few at a time.
  try {
    const old = (await oldestTombstones(getPool() as unknown as Db, 50)).filter((k) => !keys.includes(k));
    await run(old);
  } catch {
    /* the sweep is opportunistic */
  }
  return pending;
}

