import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { addItem, makePlaylist, type Manifestation } from "@/lib/library/model";
import {
  addTombstones,
  audioUsage,
  MAX_ACCOUNT_AUDIO_BYTES,
  MAX_PENDING_UPLOADS,
  uploadRefusal,
  clearTombstones,
  oldestTombstones,
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

describe("recordings waiting for deletion", () => {
  it("are kept until cleared, oldest first, without duplicates", async () => {
    await addTombstones(db, ["t1", "t2"]);
    await addTombstones(db, ["t2", "t3"]);
    expect(await oldestTombstones(db, 10, 0)).toEqual(expect.arrayContaining(["t1", "t2", "t3"]));
    await clearTombstones(db, ["t1", "t2"]);
    expect(await oldestTombstones(db, 10, 0)).toEqual(["t3"]);
    await clearTombstones(db, ["t3"]);
  });

  it("the sweep leaves fresh ones alone: they may be uploads still in progress", async () => {
    await addTombstones(db, ["fresh"]);
    await db.query(`insert into blob_tombstone (key, created_at) values ('stale', now() - interval '11 minutes')`);
    expect(await oldestTombstones(db)).toEqual(["stale"]);
    await clearTombstones(db, ["fresh", "stale"]);
  });

  it("an account deletion that rolls back leaves its rows and records nothing", async () => {
    await db.query("begin");
    const keys = await deleteAccount(db, "u-bob");
    await addTombstones(db, keys.length ? keys : ["bob-key"]);
    await db.query("rollback");
    expect((await loadLibrary(db, bob)).manifestations).toHaveLength(1);
    expect(await oldestTombstones(db, 10, 0)).toEqual([]);
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

describe("recording storage quota", () => {
  const D = "44444444-4444-4444-8444-444444444444";
  it("counts stored bytes and keeps them through a title edit", async () => {
    await db.query(`insert into "user" (id, name, email, "emailVerified") values ('u-q', 'q', 'q@x.test', true)`);
    const q = await ensureProfile(db, "u-q");
    await putManifestation(db, q, m(D, "Big"), { key: "audio/u-q/1.mp3", mime: "audio/mpeg", bytes: 5000 });
    await putManifestation(db, q, m(D, "Big, renamed"), undefined);
    expect(await audioUsage(db, q)).toEqual({ count: 1, bytes: 5000 });
  });

  it("refuses an upload that would pass the byte limit", async () => {
    expect(await uploadRefusal(db, "u-q", 1000)).toBeNull();
    expect(await uploadRefusal(db, "u-q", MAX_ACCOUNT_AUDIO_BYTES)).toMatch(/storage limit/);
  });

  it("refuses when too many uploads are in flight", async () => {
    const keys = Array.from({ length: MAX_PENDING_UPLOADS }, (_, i) => `audio/u-q/pending-${i}.mp3`);
    await addTombstones(db, keys, "upload");
    expect(await uploadRefusal(db, "u-q", 10)).toMatch(/Too many uploads/);
    await clearTombstones(db, keys);
    expect(await uploadRefusal(db, "u-q", 10)).toBeNull();
  });

  it("does not count pending deletions as uploads in flight", async () => {
    const keys = Array.from({ length: MAX_PENDING_UPLOADS + 2 }, (_, i) => `audio/u-q/deleted-${i}.mp3`);
    await addTombstones(db, keys);
    expect(await uploadRefusal(db, "u-q", 10)).toBeNull();
    await clearTombstones(db, keys);
  });

  it("lets a re-recording replace a file at the byte limit", async () => {
    const near = MAX_ACCOUNT_AUDIO_BYTES - 5000; // with the 5000 stored, the account is full
    expect(await uploadRefusal(db, "u-q", near + 1)).toMatch(/storage limit/);
    expect(await uploadRefusal(db, "u-q", 5000 + near, D)).toBeNull();
  });

  it("a user with no profile yet has an empty quota", async () => {
    expect(await uploadRefusal(db, "u-nobody", 10)).toBeNull();
  });
});

