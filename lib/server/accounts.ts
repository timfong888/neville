// Accounts: Better Auth with Google sign-in, Neon Postgres, private Vercel Blob.
// Everything here is off unless every variable below is set, so a preview or
// production build without them behaves exactly as before (device storage).
import "server-only";
import { del, get, put } from "@vercel/blob";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import pg from "pg";
import type { Db } from "@/lib/server/libraryDb";

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

let pool: pg.Pool | null = null;
function getPool(): pg.Pool {
  if (!pool) pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return pool;
}

/** Runs `fn` in one transaction on one connection. */
export async function withTx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const out = await fn(client as unknown as Db);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

function baseURL(): string | undefined {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_BRANCH_URL) return `https://${process.env.VERCEL_BRANCH_URL}`;
  return undefined;
}

let auth: ReturnType<typeof makeAuth> | null = null;
function makeAuth() {
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
    },
    plugins: [nextCookies()],
  });
}

/** The Better Auth instance. Call only when accountsEnabled() is true. */
export function getAuth() {
  if (!accountsEnabled()) throw new Error("Accounts are not enabled.");
  if (!auth) auth = makeAuth();
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
export const AUDIO_TYPES = new Set(["audio/wav", "audio/mpeg", "audio/x-wav", "audio/wave"]);

export async function storeAudio(profileId: string, manifestationId: string, file: Blob): Promise<{ key: string; mime: string }> {
  const mime = AUDIO_TYPES.has(file.type) ? file.type : "audio/mpeg";
  const ext = mime === "audio/mpeg" ? "mp3" : "wav";
  const r = await put(`audio/${profileId}/${manifestationId}.${ext}`, file, {
    access: "private",
    addRandomSuffix: true,
    contentType: mime,
  });
  return { key: r.url, mime };
}

export async function readAudio(key: string): Promise<ReadableStream<Uint8Array> | null> {
  const r = await get(key, { access: "private" });
  return r && r.statusCode === 200 ? r.stream : null;
}

/** Best effort: a key that fails to delete is logged, not retried here. */
export async function deleteAudio(keys: string[]): Promise<void> {
  if (!keys.length) return;
  try {
    await del(keys);
  } catch (e) {
    console.error("blob delete failed", keys.length, e instanceof Error ? e.message : e);
  }
}
