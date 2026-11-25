// The migration runner on PGlite: applies new files once, records a checksum,
// and refuses to run when a migration that already ran has been edited.
import { PGlite } from "@electric-sql/pglite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script, no type declarations
import { checksum, MIGRATE_LOCK, MigrationChanged, runMigrations } from "../scripts/migrate-core.mjs";

let pg: PGlite;
let dir: string;
let logs: string[];
const client = {
  query: async (text: string, params?: unknown[]) => {
    if (params) return pg.query(text, params);
    const r = await pg.exec(text); // a migration file can hold several statements
    return r[r.length - 1] ?? { rows: [] };
  },
};
const write = (name: string, sql: string) => writeFileSync(path.join(dir, name), sql);
const run = () => runMigrations(client, dir, (l: string) => logs.push(l));
const rows = async () =>
  (await pg.query<{ name: string; checksum: string | null }>("select name, checksum from schema_migrations order by name")).rows;

beforeEach(() => {
  pg = new PGlite();
  dir = mkdtempSync(path.join(tmpdir(), "migrations-"));
  logs = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("runMigrations", () => {
  it("applies each file once, in order, and records its checksum", async () => {
    write("001_a.sql", "create table a (id int);");
    write("002_b.sql", "create table b (id int); insert into b values (1);");
    await run();
    await run();
    expect(await rows()).toEqual([
      { name: "001_a.sql", checksum: checksum("create table a (id int);") },
      { name: "002_b.sql", checksum: checksum("create table b (id int); insert into b values (1);") },
    ]);
    expect((await pg.query("select count(*)::int as n from b")).rows[0]).toEqual({ n: 1 });
  });

  it("stops before applying anything when an applied migration's file was changed", async () => {
    write("001_a.sql", "create table a (id int);");
    await run();
    write("001_a.sql", "create table a (id int, extra text);"); // edited after it ran
    write("002_b.sql", "create table b (id int);"); // a new one waiting
    await expect(run()).rejects.toBeInstanceOf(MigrationChanged);
    await expect(run()).rejects.toThrow(/001_a\.sql/);
    // 002 was not applied, and 001's record is untouched.
    expect((await rows()).map((r) => r.name)).toEqual(["001_a.sql"]);
    expect((await pg.query("select to_regclass('public.b') as t")).rows[0]).toEqual({ t: null });
  });

  it("catches a different file under an already-applied name", async () => {
    write("002_share_links.sql", "create table share_link (id text, owner_token_hash text);");
    await run();
    write("002_share_links.sql", "create table if not exists share_link (id text, user_id text);");
    await expect(run()).rejects.toThrow(/002_share_links\.sql/);
  });

  it("migrations recorded before checksums existed take their current file's hash once, then are checked", async () => {
    await pg.exec(
      "create table schema_migrations (name text primary key, applied_at timestamptz not null default now()); insert into schema_migrations (name) values ('001_a.sql');",
    );
    write("001_a.sql", "create table a (id int);");
    await run();
    expect(await rows()).toEqual([{ name: "001_a.sql", checksum: checksum("create table a (id int);") }]);
    expect(logs).toContain("migrate: recorded checksum for 001_a.sql");
    write("001_a.sql", "create table a (id bigint);");
    await expect(run()).rejects.toBeInstanceOf(MigrationChanged);
  });

  it("line endings do not count as a change", async () => {
    write("001_a.sql", "create table a (id int);\n");
    await run();
    write("001_a.sql", "create table a (id int);\r\n");
    await expect(run()).resolves.toBeUndefined();
  });

  it("a failing migration rolls back and is not recorded", async () => {
    write("001_a.sql", "create table a (id int); select * from missing_table;");
    await expect(run()).rejects.toThrow();
    expect(await rows()).toEqual([]);
    expect((await pg.query("select to_regclass('public.a') as t")).rows[0]).toEqual({ t: null });
  });

  it("holds an advisory lock for the whole run, and releases it when a run fails", async () => {
    const seen: string[] = [];
    const spy = { query: (t: string, p?: unknown[]) => (seen.push(t), client.query(t, p)) };
    write("001_a.sql", "select 1;");
    await runMigrations(spy, dir, () => {});
    expect(seen[0]).toBe("select pg_advisory_lock($1)");
    expect(seen.at(-1)).toBe("select pg_advisory_unlock($1)");
    write("001_a.sql", "select 2;");
    seen.length = 0;
    await expect(runMigrations(spy, dir, () => {})).rejects.toBeInstanceOf(MigrationChanged);
    expect(seen.at(-1)).toBe("select pg_advisory_unlock($1)");
    const held = await pg.query("select count(*)::int as n from pg_locks where locktype = 'advisory' and objid = $1", [MIGRATE_LOCK]);
    expect(held.rows[0]).toEqual({ n: 0 });
  });

  it("runs this repo's migrations cleanly", async () => {
    await expect(runMigrations(client, path.join(process.cwd(), "db", "migrations"), () => {})).resolves.toBeUndefined();
    expect((await rows()).map((r) => r.name)).toEqual(["001_accounts_and_library.sql", "002_share_links.sql"]);
  });
});
