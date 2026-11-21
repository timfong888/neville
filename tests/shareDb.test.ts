import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/server/libraryDb";
import { OWNER_TOKEN, SHARE_ID, addHeld, linksShown, linksToRevoke, parseShare, readHeld, removeHeld, revokeOutcome } from "@/lib/share";

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

  it("claims a signed-out link for an account with its token, re-pointing it; never takes another account's", async () => {
    await db.query(`insert into "user" (id, name, email, "emailVerified") values ('u-d', 'D', 'd@x.test', true), ('u-e', 'E', 'e@x.test', true)`);
    const { id, ownerToken } = await S.createShare(db, { ...input, manifestationId: "legacy-1" }, null);
    const other = await S.createShare(db, input, null);
    expect(await S.claimShare(db, id, other.ownerToken, "u-d", null)).toBe(false); // wrong token
    expect(await S.claimShare(db, id, ownerToken, "u-d", "11111111-1111-4111-8111-111111111111")).toBe(true);
    // Now the account's revoke by the new id reaches it.
    expect(await S.revokeSharesOf(db, "u-d", "11111111-1111-4111-8111-111111111111")).toBe(1);
    expect(await S.getShare(db, id)).toBeNull();

    const mine = await S.createShare(db, input, "u-e");
    const token = (await S.createShare(db, input, null)).ownerToken; // unrelated
    expect(await S.claimShare(db, mine.id, mine.ownerToken, "u-d", null)).toBe(false); // u-e's link stays u-e's
    expect(token).toMatch(OWNER_TOKEN);
  });

  it("a claimed link goes when its account is deleted", async () => {
    await db.query(`insert into "user" (id, name, email, "emailVerified") values ('u-c', 'C', 'c@x.test', true)`);
    const { id, ownerToken } = await S.createShare(db, input, null);
    expect(await S.claimShare(db, id, ownerToken, "u-c", null)).toBe(true);
    await db.query(`delete from "user" where id = 'u-c'`);
    expect(await S.getShare(db, id)).toBeNull();
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

  it("keeps every link by share id, so a second tab never overwrites the first", () => {
    const m = new Map<string, string>();
    const kv = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
    const a = { shareId: "a".repeat(22), ownerToken: "b".repeat(43), createdAt: 1, manifestationId: "m1", from: "device" as const };
    const b = { ...a, shareId: "c".repeat(22), createdAt: 2 };
    expect(addHeld(kv, a)).toBe(true);
    expect(addHeld(kv, b)).toBe(true);
    expect(readHeld(kv).map((h) => h.shareId).sort()).toEqual([a.shareId, b.shareId]);
    expect(linksShown(readHeld(kv), "m1", true)[0].shareId).toBe(b.shareId); // newest first
    removeHeld(kv, a.shareId);
    expect(readHeld(kv)).toEqual([b]);
  });

  it("reads the old per-manifestation format as device links and drops junk", () => {
    const m = new Map<string, string>();
    const kv = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    m.set("nv_shares_v1", JSON.stringify({ m1: { shareId: "a".repeat(22), ownerToken: "b".repeat(43), createdAt: 1 }, m2: { shareId: "bad", ownerToken: "x" } }));
    expect(readHeld(kv)).toEqual([{ shareId: "a".repeat(22), ownerToken: "b".repeat(43), createdAt: 1, manifestationId: "m1", from: "device" }]);
    removeHeld(kv, "x".repeat(22)); // first write moves to the new format
    expect(m.has("nv_shares_v1")).toBe(false);
    expect(readHeld(kv)).toHaveLength(1);
  });

  it("deleting a device copy keeps links made from the account's copy; deleting from the account revokes all", () => {
    const base = { ownerToken: "b".repeat(43), createdAt: 1, manifestationId: "X" };
    const dev = { ...base, shareId: "d".repeat(22), from: "device" as const };
    const acc = { ...base, shareId: "e".repeat(22), from: "account" as const };
    const other = { ...dev, shareId: "f".repeat(22), manifestationId: "Y" };
    expect(linksToRevoke([dev, acc, other], "X", true)).toEqual([dev]);
    expect(linksToRevoke([dev, acc, other], "X", false)).toEqual([dev, acc]);
  });

  it("never treats links switched off as revoked", () => {
    expect(revokeOutcome(200, undefined)).toBe("gone");
    expect(revokeOutcome(404, undefined)).toBe("gone");
    expect(revokeOutcome(503, "links_off")).toBe("off");
    expect(revokeOutcome(503, undefined)).toBe("failed");
    expect(revokeOutcome(403, undefined)).toBe("failed");
  });
});
