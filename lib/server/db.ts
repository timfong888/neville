// The one Postgres connection pool, for any server code that needs the
// database (accounts, share links, usage ledger). Needs only DATABASE_URL;
// it does not depend on accounts being switched on.
import "server-only";
import pg from "pg";
import type { Db } from "@/lib/server/libraryDb";

export type { Db };

let pool: pg.Pool | null = null;

export function dbConfigured(): boolean {
  return !!process.env.DATABASE_URL?.trim();
}

export function getPool(): pg.Pool {
  if (!pool) pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 10_000 });
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
