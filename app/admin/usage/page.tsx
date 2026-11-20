import type { Metadata } from "next";
import { notFound } from "next/navigation";
import limits from "@/config/limits.json";
import { budgetLevel, sameSecret, totals } from "@/lib/ledger";
import { checkBudget, ledger } from "@/lib/server/ledger";
import { generationEnabled } from "@/lib/server/limits";
import { OPENROUTER, apiKey } from "@/lib/server/openrouter";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Usage — Neville", robots: { index: false, follow: false }, referrer: "no-referrer" };

async function keyUsage(): Promise<number | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const res = await fetch(`${OPENROUTER}/key`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const { data } = (await res.json()) as { data?: { usage?: number } };
    return typeof data?.usage === "number" ? data.usage : null;
  } catch {
    return null;
  }
}

const usd = (n: number) => `$${n.toFixed(n < 0.01 ? 5 : 4)}`;

// Tim's view of spend. Exists only when ADMIN_TOKEN is set; open it as
// /admin/usage?token=<ADMIN_TOKEN>. Reading the key's usage is free.
export default async function UsagePage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const want = process.env.ADMIN_TOKEN?.trim() ?? "";
  const given = (await searchParams).token;
  if (!sameSecret(typeof given === "string" ? given : "", want)) notFound();

  const usage = await keyUsage();
  if (usage !== null) await checkBudget(usage);
  const ceiling = limits.spendCeilingUsd;
  const level = usage === null ? null : budgetLevel(usage, ceiling);
  const pct = usage === null ? null : Math.round((usage / ceiling) * 100);
  const store = ledger();
  const rows = await store.recent(100);
  const t = totals(rows);
  const on = generationEnabled();

  return (
    <>
      <h1>Usage</h1>
      {usage === null ? (
        <p className="notice">Could not read the key&apos;s usage from OpenRouter. Recording refuses while this is so.</p>
      ) : level ? (
        <p className={level >= 100 ? "notice danger" : "notice"} role="alert">
          Spend is at {pct}% of the {usd(ceiling)} ceiling ({usd(usage)} used).{" "}
          {level >= 100 ? "Recording has stopped." : `Alert level ${level}% reached.`}
        </p>
      ) : (
        <p className="small muted">
          Spend is at {pct}% of the {usd(ceiling)} ceiling ({usd(usage)} used). Alerts at 50, 80 and 100%.
        </p>
      )}

      <div className="card">
        <p>
          <strong>Recording:</strong> {on ? "on" : "off (kill switch)"}
        </p>
        <p className="small muted">
          Kill switch: set <code>SPEECH_ENABLED=false</code> in Vercel and redeploy (about a minute), or set{" "}
          <code>generationEnabled</code> to false in <code>config/limits.json</code>. Instant: disable the key at
          openrouter.ai; recording then refuses because usage cannot be read.
        </p>
        <p className="small muted">
          Alert webhook: {process.env.ALERT_WEBHOOK_URL?.trim() ? "set" : "not set (alerts go to the runtime log only, as [budget-alert])"}.
        </p>
      </div>

      <h2>Recent paid calls</h2>
      <p className="small muted">{store.scope}</p>
      <p className="small">
        {t.calls} calls, {t.chars} characters, about {usd(t.estUsd)}
        {t.unpriced ? ` plus ${t.unpriced} unpriced` : ""}.
      </p>
      {rows.length > 0 && (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>When (UTC)</th>
                <th>Route</th>
                <th>Kind</th>
                <th>Model</th>
                <th>Chars</th>
                <th>Est.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.at}-${i}`}>
                  <td>{new Date(r.at).toISOString().slice(5, 19).replace("T", " ")}</td>
                  <td>{r.route}</td>
                  <td>{r.kind}</td>
                  <td>{r.model ?? "—"}</td>
                  <td>{r.chars}</td>
                  <td>{r.estUsd === null ? "—" : usd(r.estUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
