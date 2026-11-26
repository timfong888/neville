import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CREDITS } from "@/lib/credits";
import { ADMIN_COOKIE, adminToken, isAdminCookie } from "@/lib/server/admin";
import { dbConfigured, getPool } from "@/lib/server/db";
import type { Db } from "@/lib/server/libraryDb";
import { creditsPerAccount, creditsSpecialCounts, creditsTotals } from "@/lib/server/creditsAdmin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Credits — Neville",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// App Store prices for each pack. Update here if prices change.
// Credits per pack come from config/credits.json.
const PACK_PRICES: { [id: string]: number | undefined } = { starter: 2.99, pack10: 6.99 };

// Standard Apple fee tiers: 15% (small business programme) and 30% (standard).
const APPLE_FEES = [0.15, 0.3] as const;

const usd = (n: number) => `$${n.toFixed(4)}`;

export default async function CreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ wrong?: string }>;
}) {
  if (!adminToken()) notFound();

  if (!isAdminCookie((await cookies()).get(ADMIN_COOKIE)?.value)) {
    const wrong = (await searchParams).wrong === "1";
    return (
      <>
        <h1>Credits</h1>
        <form className="card" method="post" action="/api/admin/login">
          <label htmlFor="token">Admin token</label>
          <input id="token" name="token" type="password" autoComplete="current-password" required />
          {wrong && <p className="small danger">That token is not right.</p>}
          <button className="btn primary block" type="submit">
            Open
          </button>
        </form>
      </>
    );
  }

  if (!dbConfigured()) {
    return <p className="notice">Database not configured — no credit data to show.</p>;
  }

  const pool = getPool();
  const db: Db = {
    query: (q: string, p?: unknown[]) =>
      pool.query(q, p) as unknown as Promise<{ rows: Record<string, unknown>[] }>,
  };

  const [totals, perAccount, special] = await Promise.all([
    creditsTotals(db),
    creditsPerAccount(db),
    creditsSpecialCounts(db),
  ]);

  const avgCreditsPerRecording =
    totals.spendCount > 0 ? (totals.spent / totals.spendCount).toFixed(2) : null;

  return (
    <>
      <h1>Credits</h1>

      <h2>Totals</h2>
      <div className="card">
        <table>
          <tbody>
            <tr>
              <td>Granted (free + purchased)</td>
              <td>
                <strong>{totals.granted}</strong>
              </td>
            </tr>
            <tr>
              <td>Bought (purchases only)</td>
              <td>
                <strong>{totals.bought}</strong>
              </td>
            </tr>
            <tr>
              <td>Spent</td>
              <td>
                <strong>{totals.spent}</strong>
              </td>
            </tr>
            <tr>
              <td>Refunded</td>
              <td>
                <strong>{totals.refunded}</strong>
              </td>
            </tr>
            <tr>
              <td>Outstanding (balance owed to users)</td>
              <td>
                <strong>{totals.outstanding}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Liability</h2>
      <div className="card">
        <p>
          <strong>Outstanding credits:</strong> {totals.outstanding}
        </p>
        <p>
          <strong>Average credits per recording:</strong>{" "}
          {avgCreditsPerRecording ?? (
            <span className="muted">unknown — no spend rows yet</span>
          )}{" "}
          {avgCreditsPerRecording && (
            <span className="small muted">
              (method: total credits spent ÷ count of spend rows = {totals.spent} ÷{" "}
              {totals.spendCount})
            </span>
          )}
        </p>
        <p>
          <strong>Monetary liability:</strong>{" "}
          <span className="muted">
            Cannot compute — cost per recording not yet tracked (see issue 181). Once available:
            outstanding × cost per recording.
          </span>
        </p>
      </div>

      <h2>Revenue per credit by pack</h2>
      <p className="small muted">
        Apple fee shown at both standard tiers (15% small business, 30% standard). Prices
        hardcoded in this page; credits per pack from config/credits.json.
      </p>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Pack</th>
              <th>Credits</th>
              <th>Price</th>
              <th>Rev/credit (gross)</th>
              {APPLE_FEES.map((f) => (
                <th key={f}>Rev/credit (net {(f * 100).toFixed(0)}% fee)</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(CREDITS.products).map(([id, p]) => {
              const price = PACK_PRICES[id];
              if (price == null) return null;
              const grossPerCredit = price / p.credits;
              return (
                <tr key={id}>
                  <td>{id}</td>
                  <td>{p.credits}</td>
                  <td>{usd(price)}</td>
                  <td>{usd(grossPerCredit)}</td>
                  {APPLE_FEES.map((f) => (
                    <td key={f}>{usd(grossPerCredit * (1 - f))}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Special row counts</h2>
      <div className="card">
        <p>
          <strong>Refund rows:</strong> {special.refunds}{" "}
          <span className="small muted">(recording failed; credit returned to account)</span>
        </p>
        <p>
          <strong>Sandbox-capped rows:</strong> {special.sandboxCapped}{" "}
          <span className="small muted">
            (sandbox purchase rejected: account reached the {CREDITS.sandboxGrantCap}-credit cap;
            delta=0, environment=SANDBOX, no prior once_key grant for the same product)
          </span>
        </p>
        <p>
          <strong>Already-owned rows:</strong> {special.alreadyOwned}{" "}
          <span className="small muted">
            (once-per-account pack bought again; delta=0, environment not SANDBOX — may include
            a rare already-owned sandbox case)
          </span>
        </p>
      </div>

      <h2>Per account (sorted by spend)</h2>
      {perAccount.length === 0 ? (
        <p className="small muted">No ledger rows yet.</p>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Granted</th>
                <th>Bought</th>
                <th>Spent</th>
                <th>Recordings</th>
                <th>Refunded</th>
                <th>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {perAccount.map((a) => (
                <tr key={a.userId}>
                  <td>
                    <span className="small muted">{a.userId}</span>
                    {a.email && <span className="small"> {a.email}</span>}
                  </td>
                  <td>{a.granted}</td>
                  <td>{a.bought}</td>
                  <td>{a.spent}</td>
                  <td>{a.spendCount}</td>
                  <td>{a.refunded}</td>
                  <td>{a.outstanding}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
