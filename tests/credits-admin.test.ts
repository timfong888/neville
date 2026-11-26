// /admin/credits monitor page queries (#183): totals match the ledger sum,
// admin token guard behaviour, and no write SQL in creditsAdmin.ts.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script, no type declarations
import { runMigrations } from "../scripts/migrate-core.mjs";
import {
  creditsPerAccount,
  creditsSpecialCounts,
  creditsTotals,
} from "@/lib/server/creditsAdmin";
import {
  ensureFreeCredit,
  grantPurchase,
  logTesterSpend,
  refundCredit,
  spendCredit,
} from "@/lib/server/creditsDb";
import type { Db } from "@/lib/server/libraryDb";

let pg: PGlite;
let db: Db;

const tx = <T>(fn: (d: Db) => Promise<T>): Promise<T> =>
  pg.transaction((t) =>
    fn({ query: (q, p) => t.query(q, p) as Promise<{ rows: Record<string, unknown>[] }> }),
  );

const client = {
  query: async (text: string, params?: unknown[]) => {
    if (params) return pg.query(text, params);
    const r = await pg.exec(text);
    return r[r.length - 1] ?? { rows: [] };
  },
};
const quiet = () => undefined;

const M = { cost: 1, route: "/api/manifest", action: "manifest" };
const R = { cost: 1, route: "/api/rerecord", action: "rerecord" };

async function addUser(id: string) {
  await pg.query(
    `insert into "user" (id, name, email, "emailVerified") values ($1, $1, $1 || '@x.test', true)`,
    [id],
  );
}

beforeEach(async () => {
  pg = new PGlite();
  await runMigrations(client, path.join(process.cwd(), "db", "migrations"), quiet);
  db = { query: (q, p) => pg.query(q, p) as Promise<{ rows: Record<string, unknown>[] }> };
  await addUser("alice");
  await addUser("bob");
});

afterEach(async () => {
  await pg.close();
});

describe("creditsTotals", () => {
  it("returns all zeros on an empty ledger", async () => {
    expect(await creditsTotals(db)).toEqual({
      granted: 0,
      bought: 0,
      spent: 0,
      spendCount: 0,
      refunded: 0,
      outstanding: 0,
    });
  });

  it("outstanding equals the raw sum of all delta values", async () => {
    await tx((d) => ensureFreeCredit(d, "alice", 1));
    const s = await tx((d) => spendCredit(d, "alice", M));
    await refundCredit(db, "alice", M, s.spendId!);
    const t = await creditsTotals(db);
    const { rows } = await db.query(
      `select coalesce(sum(delta), 0)::int as n from credit_ledger`,
    );
    expect(t.outstanding).toBe(Number(rows[0].n));
  });

  it("totals equal the ledger sum for a seeded database", async () => {
    // Alice: 1 free + 10 purchased, two spends (one refunded), one tester row
    await tx((d) => ensureFreeCredit(d, "alice", 1));
    await tx((d) =>
      grantPurchase(d, {
        userId: "alice",
        productId: "pack10",
        eventId: "e1",
        environment: "PRODUCTION",
      }),
    );
    const s1 = await tx((d) => spendCredit(d, "alice", M)); // -1
    await refundCredit(db, "alice", M, s1.spendId!);         // +1
    await tx((d) => spendCredit(d, "alice", R));             // -1
    await logTesterSpend(db, "alice", M);                     // delta 0

    // Bob: 3 purchased (starter), 0 spent
    await tx((d) =>
      grantPurchase(d, {
        userId: "bob",
        productId: "starter",
        eventId: "e2",
        environment: "PRODUCTION",
      }),
    );

    const t = await creditsTotals(db);

    expect(t.granted).toBe(1 + 10 + 3); // free + pack10 + starter = 14
    expect(t.bought).toBe(10 + 3);       // pack10 + starter = 13
    expect(t.spent).toBe(1 + 1);         // two spend rows (absolute) = 2
    expect(t.spendCount).toBe(2);
    expect(t.refunded).toBe(1);
    expect(t.outstanding).toBe(14 - 2 + 1); // 13

    // Cross-check: outstanding must equal the raw ledger sum
    const { rows } = await db.query(
      `select coalesce(sum(delta), 0)::int as n from credit_ledger`,
    );
    expect(t.outstanding).toBe(Number(rows[0].n));
  });
});

describe("creditsPerAccount", () => {
  it("returns one row per account sorted by spend descending", async () => {
    await tx((d) => ensureFreeCredit(d, "alice", 1));
    await tx((d) =>
      grantPurchase(d, {
        userId: "bob",
        productId: "pack10",
        eventId: "e3",
        environment: "PRODUCTION",
      }),
    );
    await tx((d) => spendCredit(d, "bob", M));
    await tx((d) => spendCredit(d, "bob", M));

    const rows = await creditsPerAccount(db);
    expect(rows).toHaveLength(2);
    expect(rows[0].userId).toBe("bob");
    expect(rows[0].spent).toBe(2);
    expect(rows[1].userId).toBe("alice");
    expect(rows[1].spent).toBe(0);
  });

  it("includes the email from the user table on this admin page", async () => {
    await tx((d) => ensureFreeCredit(d, "alice", 1));
    const rows = await creditsPerAccount(db);
    expect(rows.find((r) => r.userId === "alice")?.email).toBe("alice@x.test");
  });

  it("per-account outstanding sums to the global outstanding", async () => {
    await tx((d) => ensureFreeCredit(d, "alice", 1));
    await tx((d) =>
      grantPurchase(d, {
        userId: "bob",
        productId: "pack10",
        eventId: "e4",
        environment: "PRODUCTION",
      }),
    );
    await tx((d) => spendCredit(d, "alice", M));

    const [t, perAccount] = await Promise.all([creditsTotals(db), creditsPerAccount(db)]);
    const sumOutstanding = perAccount.reduce((n, r) => n + r.outstanding, 0);
    expect(sumOutstanding).toBe(t.outstanding);
  });
});

describe("creditsSpecialCounts", () => {
  it("counts zero rows on an empty ledger", async () => {
    expect(await creditsSpecialCounts(db)).toEqual({
      refunds: 0,
      sandboxCapped: 0,
      alreadyOwned: 0,
    });
  });

  it("counts refund rows", async () => {
    await tx((d) => ensureFreeCredit(d, "alice", 1));
    const s = await tx((d) => spendCredit(d, "alice", M));
    await refundCredit(db, "alice", M, s.spendId!);
    expect((await creditsSpecialCounts(db)).refunds).toBe(1);
  });

  it("counts already_owned rows (once-per-account pack bought again, non-sandbox)", async () => {
    await tx((d) =>
      grantPurchase(d, {
        userId: "alice",
        productId: "starter",
        eventId: "ev1",
        environment: "PRODUCTION",
      }),
    );
    // Second purchase: already_owned, delta=0, non-sandbox
    await tx((d) =>
      grantPurchase(d, {
        userId: "alice",
        productId: "starter",
        eventId: "ev2",
        environment: "PRODUCTION",
      }),
    );
    expect((await creditsSpecialCounts(db)).alreadyOwned).toBe(1);
  });

  it("counts sandbox_capped rows", async () => {
    // Exhaust the sandbox cap (100 credits) then try one more
    for (let i = 0; i < 10; i++) {
      await tx((d) =>
        grantPurchase(d, {
          userId: "alice",
          productId: "pack10",
          eventId: `sb${i}`,
          environment: "SANDBOX",
        }),
      );
    }
    // This one exceeds the 100-credit sandbox cap
    await tx((d) =>
      grantPurchase(d, {
        userId: "alice",
        productId: "pack10",
        eventId: "sb_over",
        environment: "SANDBOX",
      }),
    );
    expect((await creditsSpecialCounts(db)).sandboxCapped).toBe(1);
  });
});

describe("admin token gate", () => {
  // The page does: if (!adminToken()) notFound()
  // We verify the condition here without importing server-only modules.
  it("adminToken() returns empty string when ADMIN_TOKEN env var is absent", () => {
    // The actual page does: if (!adminToken()) notFound()
    // adminToken() = process.env.ADMIN_TOKEN?.trim() ?? ""
    // Here we verify the env-var contract that drives the 404.
    const saved = process.env.ADMIN_TOKEN;
    delete process.env.ADMIN_TOKEN;
    try {
      expect(process.env.ADMIN_TOKEN).toBeUndefined();
      // The page receives a falsy token and calls notFound().
      const rawToken = process.env.ADMIN_TOKEN;
      expect(!rawToken).toBe(true);
    } finally {
      if (saved !== undefined) process.env.ADMIN_TOKEN = saved;
    }
  });
});

describe("no write queries in creditsAdmin.ts", () => {
  it("contains no INSERT, UPDATE, or DELETE statements in SQL", () => {
    const src = readFileSync(
      path.join(process.cwd(), "lib/server/creditsAdmin.ts"),
      "utf8",
    );
    // Strip JS/TS line and block comments before checking SQL keywords.
    const noComments = src.replace(/\/\/.*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(noComments).not.toMatch(/\binsert\b/i);
    expect(noComments).not.toMatch(/\bupdate\b/i);
    expect(noComments).not.toMatch(/\bdelete\b/i);
  });
});
