import type { Metadata } from "next";
import Diagram from "./Diagram";
import {
  COST_ROWS,
  DEMO_FLOW,
  GUARDRAILS_APP,
  GUARDRAILS_VENDOR,
  REJECTED,
  STACK,
  TABLES,
  VOICE_TIERS,
} from "@/lib/architecture";

export const metadata: Metadata = { title: "Neville — architecture" };

export default function ArchitecturePage() {
  return (
    <div className="wide" style={{ margin: "0 auto" }}>
      <h1>Architecture</h1>
      <p className="lede">
        Next.js on Vercel, with the database and files on the Vercel bill, and every AI
        call through OpenRouter on prepaid credits. No separate backend.
      </p>

      <div className="kpis">
        <div className="kpi">
          <div className="n">2 bills</div>
          <div className="l">Vercel and OpenRouter. Stripe takes its fee from revenue.</div>
        </div>
        <div className="kpi">
          <div className="n">$48–94</div>
          <div className="l">a month at 100 active users (cheap to mid voice).</div>
        </div>
        <div className="kpi">
          <div className="n">$0.22–0.68</div>
          <div className="l">variable cost per active user per month.</div>
        </div>
      </div>

      <div className="diagram">
        <Diagram />
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        The spend that grows with usage sits on the prepaid side. Scroll the diagram
        sideways on a phone.
      </p>

      <h2>The stack</h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Concern</th>
              <th>Choice</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {STACK.map(([a, b, c]) => (
              <tr key={a}>
                <td>{a}</td>
                <td>
                  <b>{b}</b>
                </td>
                <td className="muted">{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Monthly cost</h2>
      <p className="muted">
        Per active user: 4 manifestations a month with 2 variations each (2-minute
        audio), 4 images each, 20 listens, plus 5 wasted anonymous trials.
      </p>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th className="num">10 users</th>
              <th className="num">100 users</th>
              <th className="num">1,000 users</th>
            </tr>
          </thead>
          <tbody>
            {COST_ROWS.map((r) => (
              <tr key={r.label} className={r.total ? "total" : ""}>
                <td>{r.label}</td>
                {r.v.map((x, i) => (
                  <td key={i} className="num">
                    {x}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="clean" style={{ marginTop: 14 }}>
        <li>
          <b>Voice only dominates from the mid tier up.</b> On the cheap tier, images are
          the biggest line.
        </li>
        <li>
          <b>Script length is the multiplier.</b> A 10-minute meditation costs 5× the
          voice of a 2-minute one.
        </li>
        <li>
          <b>Replays are free.</b> Audio is generated once and stored.
        </li>
        <li>One image per manifestation instead of four cuts the image line by 75%.</li>
      </ul>

      <h3>Voice tiers on OpenRouter</h3>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Tier</th>
              <th>Models</th>
              <th className="num">Per 1M characters</th>
              <th className="num">Per 2-min audio</th>
            </tr>
          </thead>
          <tbody>
            {VOICE_TIERS.map(([a, b, c, d]) => (
              <tr key={a}>
                <td>{a}</td>
                <td>{b}</td>
                <td className="num">{c}</td>
                <td className="num">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        Prices read 17 Nov 2026. Mid and premium prices come from search extracts of
        OpenRouter pages and should be re-checked before choosing a tier.
      </p>

      <h2>Budget guardrails</h2>
      <p className="muted">
        Vendor caps stop spend by breaking the app, so the first line of defence is in
        our own code. Vendor caps are the backstop.
      </p>
      <div className="grid2">
        {GUARDRAILS_APP.map(([t, d]) => (
          <div className="card" key={t}>
            <h3>{t}</h3>
            <p className="muted small" style={{ margin: 0 }}>
              {d}
            </p>
          </div>
        ))}
      </div>
      <h3>Vendor backstops</h3>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Control</th>
              <th>When hit</th>
            </tr>
          </thead>
          <tbody>
            {GUARDRAILS_VENDOR.map(([a, b, c]) => (
              <tr key={a}>
                <td>{a}</td>
                <td>{b}</td>
                <td className="muted">{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 14 }}>
        <b>The number to watch weekly:</b> OpenRouter spend in the last 7 days per paying
        subscriber, next to weekly revenue per subscriber.
      </p>

      <h2>Options rejected</h2>
      <div className="grid2">
        {REJECTED.map((r) => (
          <div className="card" key={r.name}>
            <h3>{r.name}</h3>
            <p>
              <span className="pill">{r.bills}</span>
              <span className="pill">{r.at100} at 100 users</span>
            </p>
            <p className="muted small" style={{ margin: 0 }}>
              {r.why}
            </p>
          </div>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>
        Infrastructure is about $45 a month at 1,000 users in every design. AI spend is
        $200 to $2,500 and all three use OpenRouter for voice, so the tie-break is
        simplicity.
      </p>

      <h2>Demo 1 flow</h2>
      <ol className="clean">
        {DEMO_FLOW.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p className="muted small">
        Marginal cost of the whole anonymous experience: under half a cent. The{" "}
        <a href="/">prototype</a> shows steps 1, 2 and 6 to 8 with the browser&rsquo;s
        built-in speech.
      </p>

      <h2>Data model</h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Table</th>
              <th>Holds</th>
            </tr>
          </thead>
          <tbody>
            {TABLES.map(([a, b]) => (
              <tr key={a}>
                <td>
                  <code>{a}</code>
                </td>
                <td className="muted">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>
        Delete account is one transaction plus a file clean-up job. Full SQL and the
        reasoning are in <code>docs/specs/architecture.md</code>.
      </p>
    </div>
  );
}
