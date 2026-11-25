// Applies db/migrations/*.sql in name order, each once, each in a transaction,
// and stops if a migration that already ran has since been edited (see
// migrate-core.mjs). Runs during `npm run build` only when
// MIGRATE_ON_BUILD=true and DATABASE_URL is set, so previews and local builds
// never touch a database by accident.
import path from "node:path";
import pg from "pg";
import { runMigrations } from "./migrate-core.mjs";

const url = process.env.DATABASE_URL;
const forced = process.argv.includes("--force");
if (!url || (!forced && process.env.MIGRATE_ON_BUILD !== "true")) {
  console.log("migrate: skipped (set MIGRATE_ON_BUILD=true and DATABASE_URL to apply migrations)");
  process.exit(0);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await runMigrations(client, path.join(process.cwd(), "db", "migrations"));
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await client.end();
}
