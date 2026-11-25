// The retry record (#98): a revocation Apple does not accept stays in apple_revocation_pending and
// a later account deletion retries it.
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { addPendingRevocations, RETRY_BATCH, RETRY_BUDGET_MS, settleAppleRevocations, tryAddPendingRevocations } from "@/lib/server/appleRevokeDb";
import type { Db } from "@/lib/server/libraryDb";

const clients = { web: { clientId: "com.example.web", clientSecret: "web-secret" }, app: { clientId: "pckg.neville", clientSecret: "app-secret" } };
const rt = (token: string, clientId = "pckg.neville") => ({ clientId, token, hint: "refresh_token" as const });

let db: Db;
let sent: string[];
/** A stand-in for Apple's revoke endpoint: accepts or refuses, and notes each token it was sent. */
const apple = (accept: (token: string) => boolean) =>
  (async (_url: string, init: RequestInit) => {
    const form = new URLSearchParams(String(init.body));
    sent.push(`${form.get("client_id")} ${form.get("token")}`);
    return new Response(null, { status: accept(form.get("token") ?? "") ? 200 : 503 });
  }) as unknown as typeof fetch;
const down = (async () => {
  throw new Error("unreachable");
}) as unknown as typeof fetch;
const rows = async () => (await db.query(`select token, attempts from apple_revocation_pending order by id`)).rows;

beforeEach(async () => {
  const pg = new PGlite();
  // Every migration in name order, as scripts/migrate.mjs applies them: 003 runs after 002.
  for (const f of readdirSync("db/migrations").filter((n) => n.endsWith(".sql")).sort()) await pg.exec(readFileSync(`db/migrations/${f}`, "utf8"));
  db = { query: (t, p) => pg.query(t, p) as Promise<{ rows: Record<string, unknown>[] }> };
  sent = [];
});

describe("Sign in with Apple revocation retry record", () => {
  it("removes the row when Apple accepts the revocation", async () => {
    const mine = await addPendingRevocations(db, [rt("rt-1"), rt("web-rt", "com.example.web")]);
    expect(await settleAppleRevocations(db, clients, mine, apple(() => true))).toBe(0);
    expect(sent).toEqual(["pckg.neville rt-1", "com.example.web web-rt"]);
    expect(await rows()).toEqual([]);
  });

  it("keeps the row and counts the attempt when Apple is unreachable or refuses", async () => {
    const mine = await addPendingRevocations(db, [rt("rt-1")]);
    expect(await settleAppleRevocations(db, clients, mine, down)).toBe(1);
    expect(await settleAppleRevocations(db, clients, mine, apple(() => false))).toBe(1);
    expect(await rows()).toEqual([{ token: "rt-1", attempts: 2 }]);
  });

  it("retries an earlier failure on a later deletion, and clears it once Apple accepts", async () => {
    const first = await addPendingRevocations(db, [rt("old-rt")]);
    expect(await settleAppleRevocations(db, clients, first, down)).toBe(1);
    // A later, unrelated account deletion: its own token, plus the one left behind.
    const second = await addPendingRevocations(db, [rt("new-rt")]);
    expect(await settleAppleRevocations(db, clients, second, apple(() => true))).toBe(0);
    expect(sent).toEqual(["pckg.neville new-rt", "pckg.neville old-rt"]);
    expect(await rows()).toEqual([]);
  });

  it("retries with no new token at all, a bounded batch at a time, least recently tried first", async () => {
    await addPendingRevocations(db, Array.from({ length: RETRY_BATCH + 2 }, (_, i) => rt(`t${i}`)));
    expect(await settleAppleRevocations(db, clients, [], apple((t) => t !== "t0"))).toBe(0);
    expect(sent).toHaveLength(RETRY_BATCH);
    expect((await rows()).map((r) => r.token)).toEqual(["t0", `t${RETRY_BATCH}`, `t${RETRY_BATCH + 1}`]);
    sent = [];
    await settleAppleRevocations(db, clients, [], apple(() => true));
    expect(sent.map((s) => s.split(" ")[1])).toEqual([`t${RETRY_BATCH}`, `t${RETRY_BATCH + 1}`, "t0"]);
    expect(await rows()).toEqual([]);
  });

  it("stops retrying older rows once Apple has used up the time budget, but always tries its own", async () => {
    await addPendingRevocations(db, [rt("old-1"), rt("old-2")]);
    const mine = await addPendingRevocations(db, [rt("mine-1"), rt("mine-2")]);
    let now = 0;
    const slow = (async (_url: string, init: RequestInit) => {
      sent.push(new URLSearchParams(String(init.body)).get("token") ?? "");
      now += 5000; // every call runs into its deadline
      return new Response(null, { status: 503 });
    }) as unknown as typeof fetch;
    expect(await settleAppleRevocations(db, clients, mine, slow, () => now)).toBe(2);
    expect(sent).toEqual(["mine-1", "mine-2"]);
    expect(RETRY_BUDGET_MS).toBeLessThan(10000);
  });

  it("leaves a row alone when its client is no longer configured", async () => {
    const mine = await addPendingRevocations(db, [rt("rt-1", "com.gone")]);
    expect(await settleAppleRevocations(db, clients, mine, apple(() => true))).toBe(1);
    expect(sent).toEqual([]);
    expect(await rows()).toEqual([{ token: "rt-1", attempts: 1 }]);
  });

  it("does not abort the deleting transaction when the table is missing (migration 003 not applied)", async () => {
    const pg = new PGlite();
    await pg.exec(readFileSync("db/migrations/001_accounts_and_library.sql", "utf8"));
    const bare: Db = { query: (t, p) => pg.query(t, p) as Promise<{ rows: Record<string, unknown>[] }> };
    await bare.query(`insert into "user" (id, name, email, "emailVerified") values ('u1', 'U', 'u@x.test', true)`);
    await bare.query(`begin`);
    await bare.query(`delete from "user" where id = 'u1'`);
    expect(await tryAddPendingRevocations(bare, [rt("rt-1")])).toBeNull();
    // The transaction is still usable and commits: the account is gone.
    await bare.query(`commit`);
    expect((await bare.query(`select id from "user"`)).rows).toEqual([]);
  });

  it("records inside a transaction when the table is there, and writes nothing for no tokens", async () => {
    await db.query(`begin`);
    expect(await tryAddPendingRevocations(db, [])).toEqual([]);
    expect(await tryAddPendingRevocations(db, [rt("rt-1")])).toHaveLength(1);
    await db.query(`commit`);
    expect(await rows()).toEqual([{ token: "rt-1", attempts: 0 }]);
  });
});
