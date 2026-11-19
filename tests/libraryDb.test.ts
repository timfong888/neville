import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { addItem, makePlaylist, type Manifestation } from "@/lib/library/model";
import {
  cleanManifestation,
  type Db,
  deleteAccount,
  deleteManifestation,
  deletePlaylist,
  ensureProfile,
  getAudio,
  loadLibrary,
  putManifestation,
  putPlaylist,
} from "@/lib/server/libraryDb";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

let db: Db;
let alice: string;
let bob: string;

const m = (id: string, title: string): Manifestation => ({
  id,
  title,
  want: "w",
  firstName: "Al",
  lines: ["one", "two"],
  voiceId: "v",
  voiceName: "V",
  hasAudio: false,
  createdAt: Date.now() - 1000,
  updatedAt: Date.now(),
});

beforeAll(async () => {
  const pg = new PGlite();
  await pg.exec(readFileSync("db/migrations/001_accounts_and_library.sql", "utf8"));
  db = { query: (t, p) => pg.query(t, p) as Promise<{ rows: Record<string, unknown>[] }> };
  for (const u of ["u-alice", "u-bob"]) {
    await db.query(`insert into "user" (id, name, email, "emailVerified") values ($1, $1, $1 || '@x.test', true)`, [u]);
  }
  alice = await ensureProfile(db, "u-alice");
  bob = await ensureProfile(db, "u-bob");
});

describe("library in Postgres", () => {
  it("ensureProfile is idempotent", async () => {
    expect(await ensureProfile(db, "u-alice")).toBe(alice);
  });

  it("saves, keeps audio on a title edit, drops it when asked", async () => {
    expect(await putManifestation(db, alice, m(A, "First"), { key: "k1", mime: "audio/wav" })).toEqual([]);
    expect((await getAudio(db, alice, A))?.key).toBe("k1");
    expect(await putManifestation(db, alice, { ...m(A, "Renamed") }, undefined)).toEqual([]);
    let lib = await loadLibrary(db, alice);
    expect(lib.manifestations[0]).toMatchObject({ id: A, title: "Renamed", hasAudio: true, lines: ["one", "two"] });
    expect(await putManifestation(db, alice, { ...m(A, "Renamed"), lines: ["new"] }, null)).toEqual(["k1"]);
    lib = await loadLibrary(db, alice);
    expect(lib.manifestations[0]).toMatchObject({ hasAudio: false, lines: ["new"] });
  });

  it("never lets one person read or change another's rows", async () => {
    expect(await putManifestation(db, bob, m(A, "Hijack"), null)).toBeNull();
    expect(await getAudio(db, bob, A)).toBeNull();
    expect(await deleteManifestation(db, bob, A)).toBeNull();
    expect((await loadLibrary(db, bob)).manifestations).toEqual([]);
    expect((await loadLibrary(db, alice)).manifestations[0].title).toBe("Renamed");
  });

  it("stores playlists in order and drops items the caller does not own", async () => {
    await putManifestation(db, alice, m(B, "Second"), { key: "k2", mime: "audio/wav" });
    await putManifestation(db, bob, m(C, "Bob's"), null);
    const p = [B, C, A].reduce((acc, id) => addItem(acc, id), makePlaylist("Morning"));
    expect(await putPlaylist(db, alice, p)).toBe(true);
    let lib = await loadLibrary(db, alice);
    expect(lib.playlists[0]).toMatchObject({ id: p.id, name: "Morning", itemIds: [B, A] });
    expect(await putPlaylist(db, bob, { ...p, name: "Mine now" })).toBe(false);
    expect(await deletePlaylist(db, bob, p.id)).toBe(false);
    expect(await deleteManifestation(db, alice, B)).toEqual(["k2"]);
    lib = await loadLibrary(db, alice);
    expect(lib.playlists[0].itemIds).toEqual([A]);
  });

  it("deleting the account removes everything and returns the audio keys", async () => {
    await putManifestation(db, alice, m(B, "Again"), { key: "k3", mime: "audio/wav" });
    expect((await deleteAccount(db, "u-alice")).sort()).toEqual(["k3"]);
    const count = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0].n;
    expect(await count(`select count(*)::int as n from profile where user_id = 'u-alice'`)).toBe(0);
    expect(await count(`select count(*)::int as n from manifestation where profile_id = $1`, [alice])).toBe(0);
    expect(await count(`select count(*)::int as n from rendition where manifestation_id = any($1::uuid[])`, [[A, B]])).toBe(0);
    expect(await count(`select count(*)::int as n from playlist where profile_id = $1`, [alice])).toBe(0);
    expect((await loadLibrary(db, bob)).manifestations).toHaveLength(1);
  });
});

describe("input from the browser", () => {
  it("rejects empty scripts and caps sizes", () => {
    expect(cleanManifestation({ title: "x", lines: [] }, A)).toBeNull();
    expect(cleanManifestation({ title: "  ", lines: ["a"] }, A)).toBeNull();
    const c = cleanManifestation({ title: "t".repeat(200), lines: ["a", 5], want: "w".repeat(500), createdAt: 9e15 }, A)!;
    expect(c.title).toHaveLength(80);
    expect(c.lines).toEqual(["a"]);
    expect(c.want).toHaveLength(280);
    expect(c.createdAt).toBeLessThanOrEqual(Date.now());
  });
});
