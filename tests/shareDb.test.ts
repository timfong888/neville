import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/server/libraryDb";
import { OWNER_TOKEN, SHARE_ID, parseShare, readHeld, writeHeld } from "@/lib/share";

vi.mock("server-only", () => ({}));

let db: Db;
let S: typeof import("@/lib/server/shareDb");

beforeAll(async () => {
  const pg = new PGlite();
  await pg.exec(readFileSync("db/migrations/001_accounts_and_library.sql", "utf8"));
  await pg.exec(readFileSync("db/migrations/002_share_links.sql", "utf8"));
  // Applying twice must be harmless (create ... if not exists).
  await pg.exec(readFileSync("db/migrations/002_share_links.sql", "utf8"));
  db = { query: (t, p) => pg.query(t, p) as Promise<{ rows: Record<string, unknown>[] }> };
  await db.query(`insert into "user" (id, name, email, "emailVerified") values ('u-a', 'A', 'a@x.test', true), ('u-b', 'B', 'b@x.test', true)`);
  S = await import("@/lib/server/shareDb");
});

const input = { title: "Calm", lines: ["Take a breath.", "You are calm."], voiceName: "Nadine", manifestationId: "m-1" };

describe("share links in Postgres", () => {
  it("creates a link readable by id, and stores only the token's hash", async () => {
    const { id, ownerToken } = await S.createShare(db, input, null);
    expect(id).toMatch(SHARE_ID);
    expect(ownerToken).toMatch(OWNER_TOKEN);
    expect(await S.getShare(db, id)).toMatchObject({ id, title: "Calm", lines: input.lines, voiceName: "Nadine" });
    const { rows } = await db.query("select owner_token_hash from share_link where id = $1", [id]);
    expect(rows[0].owner_token_hash).toBe(S.hashToken(ownerToken));
    expect(JSON.stringify(rows)).not.toContain(ownerToken);
  });

  it("revokes only with the right token; afterwards the page is gone", async () => {
    const { id, ownerToken } = await S.createShare(db, input, null);
    const other = await S.createShare(db, input, null);
    expect(await S.revokeShare(db, id, other.ownerToken, null)).toBe(false);
    expect(await S.revokeShare(db, id, null, "u-a")).toBe(false);
    expect(await S.getShare(db, id)).not.toBeNull();
    expect(await S.revokeShare(db, id, ownerToken, null)).toBe(true);
    expect(await S.getShare(db, id)).toBeNull();
    expect(await S.revokeShare(db, id, ownerToken, null)).toBe(false);
  });

  it("lets the signed-in maker revoke without the token, and nobody else", async () => {
    const { id } = await S.createShare(db, input, "u-a");
    expect(await S.revokeShare(db, id, null, "u-b")).toBe(false);
    expect(await S.revokeShare(db, id, null, "u-a")).toBe(true);
  });

  it("deleting the account deletes its links; signed-out links stay", async () => {
    const mine = await S.createShare(db, input, "u-b");
    const anon = await S.createShare(db, input, null);
    await db.query(`delete from "user" where id = 'u-b'`);
    expect(await S.getShare(db, mine.id)).toBeNull();
    expect(await S.getShare(db, anon.id)).not.toBeNull();
  });

  it("revokes a signed-in user's links to one manifestation from any device, and only theirs", async () => {
    const mine = await S.createShare(db, input, "u-a");
    const other = await S.createShare(db, { ...input, manifestationId: "m-2" }, "u-a");
    const anon = await S.createShare(db, input, null);
    expect(await S.revokeSharesOf(db, "u-x", "m-1")).toBe(0);
    expect(await S.revokeSharesOf(db, "u-a", "m-1")).toBe(1);
    expect(await S.getShare(db, mine.id)).toBeNull();
    expect(await S.getShare(db, other.id)).not.toBeNull();
    expect(await S.getShare(db, anon.id)).not.toBeNull();
  });

  it("ignores malformed ids without querying", async () => {
    expect(await S.getShare(db, "../etc")).toBeNull();
    expect(await S.revokeShare(db, "x", "y", null)).toBe(false);
  });
});

describe("share requests and device memory", () => {
  it("validates title, lines and length", () => {
    expect(parseShare({ title: "  A  title ", lines: [" one ", ""], voiceName: "Nadine<script>" }, 700)).toEqual({
      ok: true,
      value: { title: "A title", lines: ["one"], voiceName: "Nadinescript", manifestationId: null },
    });
    expect(parseShare({ title: "", lines: ["x"] }, 700).ok).toBe(false);
    expect(parseShare({ title: "t", lines: [] }, 700).ok).toBe(false);
    expect(parseShare({ title: "t", lines: ["a".repeat(701)] }, 700).ok).toBe(false);
  });

  it("remembers and forgets the owner token per manifestation, dropping junk", () => {
    const m = new Map<string, string>();
    const kv = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    const h = { shareId: "a".repeat(22), ownerToken: "b".repeat(43), createdAt: 1 };
    expect(writeHeld(kv, "m1", h)).toBe(true);
    expect(readHeld(kv)).toEqual({ m1: h });
    m.set("nv_shares_v1", JSON.stringify({ m1: h, m2: { shareId: "bad", ownerToken: "x" } }));
    expect(Object.keys(readHeld(kv))).toEqual(["m1"]);
    writeHeld(kv, "m1", null);
    expect(readHeld(kv)).toEqual({});
  });
});
