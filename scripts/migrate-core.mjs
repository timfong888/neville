// The migration runner's logic, separate from the connection so tests can run
// it on PGlite. `client` is anything with `query(text, params?)` returning
// `{ rows }`; a migration file is sent as one query with no params.
//
// Each applied migration is recorded with a SHA-256 of its file. Before
// applying anything, every recorded migration is checked against its file in
// the repo: if one was edited (or replaced by a different file with the same
// name) after it was applied, the run stops with an error and nothing is
// applied, so the build fails instead of silently skipping changed SQL. To
// change the schema, add a new migration; never edit one that has run.
//
// Migrations recorded before checksums existed (checksum null) take the hash
// of their current file on the first run that sees them.
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/** SHA-256 of a migration's text, with line endings normalised so a checkout's CRLF setting does not matter. */
export function checksum(sql) {
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

export class MigrationChanged extends Error {
  constructor(changed) {
    super(
      "migrate: these migrations were changed after they were applied:\n" +
        changed.map((c) => `  ${c.name}: applied ${c.recorded.slice(0, 12)}, file now ${c.current.slice(0, 12)}`).join("\n") +
        "\nRestore the original file and put the change in a new migration. Nothing was applied.",
    );
    this.name = "MigrationChanged";
    this.changed = changed;
  }
}

export async function runMigrations(client, dir, log = console.log) {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const sql = new Map();
  for (const f of files) sql.set(f, await readFile(path.join(dir, f), "utf8"));

  await client.query(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  // The runner's own bookkeeping, not app schema, so it lives here rather
  // than in a migration (a migration could not record its own checksum).
  await client.query("alter table schema_migrations add column if not exists checksum text");

  const recorded = new Map(
    (await client.query("select name, checksum from schema_migrations")).rows.map((r) => [r.name, r.checksum ?? null]),
  );

  // Check everything before applying anything.
  const changed = [];
  const backfill = [];
  for (const [name, rec] of recorded) {
    if (!sql.has(name)) {
      log(`migrate: warning: ${name} is recorded as applied but has no file`);
      continue;
    }
    const current = checksum(sql.get(name));
    if (rec === null) backfill.push([name, current]);
    else if (rec !== current) changed.push({ name, recorded: rec, current });
  }
  if (changed.length) throw new MigrationChanged(changed);

  for (const [name, current] of backfill) {
    await client.query("update schema_migrations set checksum = $1 where name = $2 and checksum is null", [current, name]);
    log(`migrate: recorded checksum for ${name}`);
  }

  for (const f of files) {
    if (recorded.has(f)) continue;
    await client.query("begin");
    try {
      await client.query(sql.get(f));
      await client.query("insert into schema_migrations (name, checksum) values ($1, $2)", [f, checksum(sql.get(f))]);
      await client.query("commit");
      log(`migrate: applied ${f}`);
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
  }
  log("migrate: up to date");
}
