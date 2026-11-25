import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ensureProfile, putManifestation, deleteManifestation, type Db } from "@/lib/server/libraryDb";
import { SHARE_ID, frozenCopy, parseShare } from "@/lib/share";

vi.mock("server-only", () => ({}));

let db: Db;
let S: typeof import("@/lib/server/shareDb");
let pa: string;

const MA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // u-a's
const MA2 = "aaaaaaaa-aaaa-4aaa-8aaa-bbbbbbbbbbbb"; // u-a's
const MB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // u-b's
const MC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // u-c's
const NONE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"; // nobody's

const m = (id: string) => ({
  id,
  title: "Calm",
  want: "w",
  firstName: "A",
  lines: ["Take a breath."],
  voiceId: "v",
  voiceName: "V",
  hasAudio: false,
  createdAt: Date.now() - 1000,
  updatedAt: Date.now(),
});
const input = (manifestationId: string) => ({ title: "Calm", lines: ["Take a breath.", "You are calm."], voiceName: "Nadine", manifestationId });

beforeAll(async () => {
  const pg = new PGlite();
  await pg.exec(readFileSync("db/migrations/001_accounts_and_library.sql", "utf8"));
  await pg.exec(readFileSync("db/migrations/002_share_links.sql", "utf8"));
  // Applying twice must be harmless (create ... if not exists).
  await pg.exec(readFileSync("db/migrations/002_share_links.sql", "utf8"));
  db = { query: (t, p) => pg.query(t, p) as Promise<{ rows: Record<string, unknown>[] }> };
  for (const u of ["u-a", "u-b", "u-c"]) {
    await db.query(`insert into "user" (id, name, email, "emailVerified") values ($1, $1, $1 || '@x.test', true)`, [u]);
  }
  pa = await ensureProfile(db, "u-a");
  await putManifestation(db, pa, m(MA), null);
  await putManifestation(db, pa, m(MA2), null);
  await putManifestation(db, await ensureProfile(db, "u-b"), m(MB), null);
  await putManifestation(db, await ensureProfile(db, "u-c"), m(MC), null);
  S = await import("@/lib/server/shareDb");
});

const make = async (user: string, mid: string) => {
  const r = await S.createShare(db, user, input(mid));
  if (!r.ok) throw new Error(r.reason);
  return r.id;
};

describe("share links in Postgres", () => {
  it("a signed-in account makes a link to its own manifestation; anyone can read it by id", async () => {
    const id = await make("u-a", MA);
    expect(id).toMatch(SHARE_ID);
    expect(await S.getShare(db, id)).toMatchObject({ id, title: "Calm", lines: input(MA).lines, voiceName: "Nadine" });
  });

  it("refuses a manifestation the account does not own, or that does not exist", async () => {
    for (const [u, mid] of [["u-a", MB], ["u-a", NONE], ["u-nobody", MA]]) {
      expect(await S.reserveShareAttempt(db, u, mid, 1000)).toEqual({ ok: false, reason: "not_found" });
      expect(await S.createShare(db, u, input(mid))).toEqual({ ok: false, reason: "not_found" });
    }
  });

  it("every link has an owner: the table refuses a row without one", async () => {
    await expect(
      db.query(`insert into share_link (id, user_id, manifestation_id, title, lines) values ($1, null, $2, 't', '[]')`, ["x".repeat(22), MA]),
    ).rejects.toThrow();
  });

  it("only the maker can revoke, from any device; afterwards the page is gone", async () => {
    const id = await make("u-a", MA);
    expect(await S.revokeShare(db, "u-b", id)).toBe(false);
    expect(await S.getShare(db, id)).not.toBeNull();
    expect(await S.revokeShare(db, "u-a", id)).toBe(true);
    expect(await S.getShare(db, id)).toBeNull();
    expect(await S.revokeShare(db, "u-a", id)).toBe(false);
  });

  it("lists the account's own live links to one manifestation, newest first, and nobody else's", async () => {
    const one = await make("u-a", MA2);
    const two = await make("u-a", MA2);
    const listed = await S.listShares(db, "u-a", MA2);
    expect(listed.map((l) => l.id).sort()).toEqual([one, two].sort());
    expect(await S.listShares(db, "u-b", MA2)).toEqual([]);
    for (const l of listed) await S.revokeShare(db, "u-a", l.id);
  });

  it("deleting the manifestation deletes its links", async () => {
    const id = await make("u-a", MA2);
    expect(await deleteManifestation(db, pa, MA2)).not.toBeNull();
    expect(await S.getShare(db, id)).toBeNull();
  });

  it("caps an account at 20 attempts in 24 hours, counted before the content check; revoking does not free one", async () => {
    for (let i = 0; i < S.MAX_LINKS_PER_DAY; i++) expect((await S.reserveShareAttempt(db, "u-c", MC, 1000)).ok).toBe(true);
    expect(await S.reserveShareAttempt(db, "u-c", MC, 1000)).toEqual({ ok: false, reason: "daily_limit" });
    const id = await make("u-c", MC);
    await S.revokeShare(db, "u-c", id);
    expect(await S.reserveShareAttempt(db, "u-c", MC, 1000)).toEqual({ ok: false, reason: "daily_limit" });
    expect((await S.reserveShareAttempt(db, "u-a", MA, 1000)).ok).toBe(true); // another account is unaffected
    await db.query(`update share_attempt set created_at = now() - interval '25 hours' where user_id = 'u-c'`);
    expect((await S.reserveShareAttempt(db, "u-c", MC, 1000)).ok).toBe(true);
    const { rows } = await db.query(`select count(*)::int as n from share_attempt where user_id = 'u-c'`);
    expect(rows[0].n).toBe(1); // older attempts pruned
  });

  it("deleting the account deletes its links and leaves others'", async () => {
    const mine = await make("u-b", MB);
    const theirs = await make("u-a", MA);
    await db.query(`delete from "user" where id = 'u-b'`);
    expect(await S.getShare(db, mine)).toBeNull();
    expect(await S.getShare(db, theirs)).not.toBeNull();
  });

  it("ignores malformed ids", async () => {
    expect(await S.getShare(db, "../etc")).toBeNull();
    expect(await S.revokeShare(db, "u-a", "short")).toBe(false);
    expect(await S.listShares(db, "u-a", "not-a-uuid")).toEqual([]);
    expect(await S.createShare(db, "u-a", input("not-a-uuid"))).toEqual({ ok: false, reason: "not_found" });
    expect(await S.reserveShareAttempt(db, "u-a", "not-a-uuid", 1000)).toEqual({ ok: false, reason: "not_found" });
  });
  it("an attempt given back no longer counts; only the owner's own attempt can be given back", async () => {
    const count = async (u: string): Promise<number> => Number((await db.query(`select count(*)::int as n from share_attempt where user_id = $1`, [u])).rows[0].n);
    const r = await S.reserveShareAttempt(db, "u-a", MA, 1000);
    if (!r.ok) throw new Error("expected a slot");
    const before = await count("u-a");
    await S.releaseShareAttempt(db, "u-b", r.attemptId); // someone else's id: nothing happens
    expect(await count("u-a")).toBe(before);
    await S.releaseShareAttempt(db, "u-a", r.attemptId);
    expect(await count("u-a")).toBe(before - 1);
  });
});

describe("share requests", () => {
  it("name only an account manifestation id", () => {
    expect(parseShare({ title: "t", lines: ["a"] })).toMatchObject({ ok: false });
    expect(parseShare({ manifestationId: "device-123" })).toMatchObject({ ok: false });
    expect(parseShare({ manifestationId: MA, title: "ignored" })).toEqual({ ok: true, manifestationId: MA });
  });

  it("freeze a normalised, capped copy of the saved text", () => {
    expect(frozenCopy({ title: " ", lines: ["a"], voiceName: "" }, 100)).toMatchObject({ ok: false });
    expect(frozenCopy({ title: "t", lines: [], voiceName: "" }, 100)).toMatchObject({ ok: false });
    expect(frozenCopy({ title: "t", lines: null, voiceName: "" }, 100)).toMatchObject({ ok: false });
    expect(frozenCopy({ title: "t", lines: ["x".repeat(101)], voiceName: "" }, 100)).toMatchObject({ ok: false });
    expect(frozenCopy({ title: "t", lines: ["  a  b ", "", 5], voiceName: "N<script>" }, 100)).toEqual({ ok: true, title: "t", lines: ["a b"], voiceName: "Nscript" });
  });
});

describe("the frozen copy comes from the account, not the request", () => {
  it("is the saved title and newest script; the voice is named only with a recording", async () => {
    await db.query(`insert into "user" (id, name, email, "emailVerified") values ('u-d', 'd', 'd@x.test', true)`);
    const pd = await ensureProfile(db, "u-d");
    const MD = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    await putManifestation(db, pd, { ...m(MD), title: "Saved", lines: ["Saved line."], voiceName: "Nadine" }, null);
    const r = await S.reserveShareAttempt(db, "u-d", MD, 1000);
    expect(r).toEqual({ ok: true, copy: { manifestationId: MD, title: "Saved", lines: ["Saved line."], voiceName: "" }, attemptId: expect.any(String) });
    await putManifestation(db, pd, { ...m(MD), title: "Edited", lines: ["New line."], voiceName: "Nadine" }, { key: "audio/u-d/1.mp3", mime: "audio/mpeg", bytes: 10 });
    const r2 = await S.reserveShareAttempt(db, "u-d", MD, 1000);
    expect(r2).toMatchObject({ ok: true, copy: { title: "Edited", lines: ["New line."], voiceName: "Nadine" } });
  });

  it("a saved copy that cannot be shared is refused without using an attempt", async () => {
    await db.query(`insert into "user" (id, name, email, "emailVerified") values ('u-e', 'e', 'e@x.test', true)`);
    const pe = await ensureProfile(db, "u-e");
    const ME = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    await putManifestation(db, pe, { ...m(ME), lines: ["x".repeat(50)] }, null);
    expect(await S.reserveShareAttempt(db, "u-e", ME, 10)).toMatchObject({ ok: false, reason: "not_shareable" });
    const { rows } = await db.query(`select count(*)::int as n from share_attempt where user_id = 'u-e'`);
    expect(rows[0].n).toBe(0);
  });
});
