// Applies db/migrations/*.sql in name order, each once, each in a transaction.
// Runs during `npm run build` only when MIGRATE_ON_BUILD=true and DATABASE_URL
// is set, so previews and local builds never touch a database by accident.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
const forced = process.argv.includes("--force");
if (!url || (!forced && process.env.MIGRATE_ON_BUILD !== "true")) {
  console.log("migrate: skipped (set MIGRATE_ON_BUILD=true and DATABASE_URL to apply migrations)");
  process.exit(0);
}

const dir = path.join(process.cwd(), "db", "migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const done = new Set((await client.query("select name from schema_migrations")).rows.map((r) => r.name));
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await readFile(path.join(dir, f), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into schema_migrations (name) values ($1)", [f]);
      await client.query("commit");
      console.log(`migrate: applied ${f}`);
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
  }
  console.log("migrate: up to date");
} finally {
  await client.end();
}
