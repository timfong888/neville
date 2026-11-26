"use client";

import { useState } from "react";
import {
  RANGES,
  type Range,
  type DayBucket,
  type RevCostDay,
  type UserCost,
  type MockRecording,
  spendPerDay,
  revenueVsCost,
  topUsers,
  creditSummary,
  costPerRecording,
  recordingsInRange,
  MOCK_DATA,
} from "@/lib/mock/costData";

// --- SVG chart primitives ---

const W = 440;
const H = 180;
const PAD = { top: 16, right: 12, bottom: 36, left: 52 };
const IW = W - PAD.left - PAD.right;
const IH = H - PAD.top - PAD.bottom;

function usd(n: number) {
  if (n === 0) return "$0.00";
  return n >= 1 ? `$${n.toFixed(2)}` : n >= 0.01 ? `$${n.toFixed(3)}` : `$${n.toFixed(5)}`;
}

function yScale(max: number) {
  return (v: number) => IH - (v / max) * IH;
}

function niceMax(v: number) {
  if (v === 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const frac = v / exp;
  const ceil = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return ceil * exp;
}

type StackedBarChartProps = { data: DayBucket[]; ceiling: number };

function StackedBarChart({ data, ceiling }: StackedBarChartProps) {
  const rawMax = Math.max(...data.map((d) => d.total), ceiling);
  const maxVal = niceMax(rawMax);
  const ys = yScale(maxVal);
  const barW = data.length > 0 ? Math.max(4, IW / data.length - 2) : 20;
  const xStep = data.length > 0 ? IW / data.length : 1;

  const COLORS = { script: "var(--accent)", speech: "var(--good)", image: "var(--warn)" };
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxVal);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }} aria-label="Spend per day stacked by model type">
      <g transform={`translate(${PAD.left},${PAD.top})`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={0} y1={ys(t)} x2={IW} y2={ys(t)} stroke="var(--line)" strokeWidth={0.5} />
            <text x={-6} y={ys(t) + 4} textAnchor="end" fontSize={10} fill="var(--muted)">{usd(t)}</text>
          </g>
        ))}

        {/* $2 ceiling */}
        {ceiling <= maxVal && (
          <g>
            <line x1={0} y1={ys(ceiling)} x2={IW} y2={ys(ceiling)} stroke="var(--warn)" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={IW + 4} y={ys(ceiling) + 4} fontSize={9} fill="var(--warn)">$2</text>
          </g>
        )}

        {data.map((d, i) => {
          const x = i * xStep + (xStep - barW) / 2;
          let y = IH;
          return (
            <g key={d.date}>
              {(["script", "speech", "image"] as const).map((kind) => {
                const h = (d[kind] / maxVal) * IH;
                y -= h;
                return <rect key={kind} x={x} y={y} width={barW} height={h} fill={COLORS[kind]} opacity={0.9} rx={1} />;
              })}
              {i % Math.max(1, Math.floor(data.length / 6)) === 0 && (
                <text x={x + barW / 2} y={IH + 14} textAnchor="middle" fontSize={9} fill="var(--muted)">{d.date.slice(5)}</text>
              )}
            </g>
          );
        })}

        <line x1={0} y1={IH} x2={IW} y2={IH} stroke="var(--line)" strokeWidth={1} />
      </g>
    </svg>
  );
}

type LineChartProps = { data: RevCostDay[] };

function LineChart({ data }: LineChartProps) {
  const allVals = data.flatMap((d) => [d.revenue, d.cost]);
  const maxVal = niceMax(Math.max(...allVals, 0.01));
  const ys = yScale(maxVal);
  const xStep = data.length > 1 ? IW / (data.length - 1) : IW;
  const ticks = [0, 0.5, 1].map((f) => f * maxVal);

  const pts = (key: "revenue" | "cost") =>
    data.map((d, i) => `${i * xStep},${ys(d[key])}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }} aria-label="Revenue vs cost per day">
      <g transform={`translate(${PAD.left},${PAD.top})`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={0} y1={ys(t)} x2={IW} y2={ys(t)} stroke="var(--line)" strokeWidth={0.5} />
            <text x={-6} y={ys(t) + 4} textAnchor="end" fontSize={10} fill="var(--muted)">{usd(t)}</text>
          </g>
        ))}
        {data.length > 1 && (
          <>
            <polyline points={pts("revenue")} fill="none" stroke="var(--good)" strokeWidth={2} />
            <polyline points={pts("cost")} fill="none" stroke="var(--warn)" strokeWidth={2} />
          </>
        )}
        {data.map((d, i) => (
          i % Math.max(1, Math.floor(data.length / 6)) === 0 && (
            <text key={d.date} x={i * xStep} y={IH + 14} textAnchor="middle" fontSize={9} fill="var(--muted)">{d.date.slice(5)}</text>
          )
        ))}
        <line x1={0} y1={IH} x2={IW} y2={IH} stroke="var(--line)" strokeWidth={1} />
      </g>
    </svg>
  );
}

type HBarChartProps = { data: UserCost[]; onClickUser: (userId: string) => void };

const HW = 440;
const HH = 160;
const HP = { top: 8, right: 60, bottom: 24, left: 90 };

function HBarChart({ data, onClickUser }: HBarChartProps) {
  const rows = data.slice(0, 5);
  const maxVal = Math.max(...rows.map((r) => r.totalUsd), 0.01);
  const IWH = HW - HP.left - HP.right;
  const rowH = rows.length > 0 ? Math.min(28, (HH - HP.top - HP.bottom) / rows.length) : 28;

  return (
    <svg viewBox={`0 0 ${HW} ${HH}`} width="100%" style={{ display: "block", overflow: "visible" }} aria-label="Top users by cost">
      <g transform={`translate(${HP.left},${HP.top})`}>
        {rows.map((r, i) => {
          const barLen = (r.totalUsd / maxVal) * IWH;
          const y = i * rowH;
          return (
            <g key={r.userId} style={{ cursor: "pointer" }} onClick={() => onClickUser(r.userId)} role="button" aria-label={`Drill down: ${r.name}`}>
              <text x={-6} y={y + rowH * 0.65} textAnchor="end" fontSize={11} fill="var(--text)">{r.name.split(" ")[0]}</text>
              <rect x={0} y={y + 2} width={barLen} height={rowH - 6} fill="var(--accent)" rx={3} opacity={0.85} />
              <text x={barLen + 4} y={y + rowH * 0.65} fontSize={10} fill="var(--muted)">{usd(r.totalUsd)}</text>
            </g>
          );
        })}
        <line x1={0} y1={rows.length * rowH} x2={IWH} y2={rows.length * rowH} stroke="var(--line)" strokeWidth={1} />
      </g>
    </svg>
  );
}

type SparklineProps = { values: number[] };
function Sparkline({ values }: SparklineProps) {
  const max = Math.max(...values, 0.001);
  const W2 = 80;
  const H2 = 28;
  const step = values.length > 1 ? W2 / (values.length - 1) : W2;
  const pts = values.map((v, i) => `${i * step},${H2 - (v / max) * H2}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W2} ${H2}`} width={W2} height={H2} style={{ display: "inline-block", verticalAlign: "middle" }}>
      <polyline points={pts} fill="none" stroke="var(--accent-text)" strokeWidth={1.5} />
    </svg>
  );
}

// --- Drill-down table ---

type DrillTarget = { type: "day"; date: string } | { type: "user"; userId: string } | null;

function DrillTable({ target, range }: { target: DrillTarget; range: Range }) {
  if (!target) return null;

  const recs = recordingsInRange(range);
  let filtered: MockRecording[];

  if (target.type === "day") {
    filtered = recs.filter((r) => new Date(r.at).toISOString().slice(0, 10) === target.date);
  } else {
    filtered = recs.filter((r) => r.userId === target.userId);
  }

  const user = target.type === "user" ? MOCK_DATA.users.find((u) => u.id === target.userId) : null;

  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 14, color: "var(--muted)" }}>
        {target.type === "day" ? `Recordings on ${target.date}` : `Recordings by ${user?.name ?? target.userId}`}
      </h3>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Recording</th>
              <th>User</th>
              <th>Time (UTC)</th>
              <th>Model calls</th>
              <th>Est. cost</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((rec) => {
              const recUser = MOCK_DATA.users.find((u) => u.id === rec.userId);
              const totalCost = rec.calls.reduce((s, c) => s + c.estUsd, 0);
              return (
                <tr key={rec.id}>
                  <td>{rec.title}</td>
                  <td>{recUser?.name ?? rec.userId}</td>
                  <td>{new Date(rec.at).toISOString().slice(5, 19).replace("T", " ")}</td>
                  <td>
                    <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: 11 }}>
                      {rec.calls.map((c, i) => (
                        <li key={i}>{c.model} ({c.kind}) {usd(c.estUsd)}{!c.ok ? " ⚠" : ""}</li>
                      ))}
                    </ul>
                  </td>
                  <td>{usd(totalCost)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Main dashboard ---

const CEILING = 2.0;

export default function Dashboard() {
  const [range, setRange] = useState<Range>("7d");
  const [drill, setDrill] = useState<DrillTarget>(null);

  const days = spendPerDay(range);
  const rcDays = revenueVsCost(range);
  const users = topUsers(range);
  const credits = creditSummary();
  const cpr = costPerRecording(range);
  const totalCost = days.reduce((s, d) => s + d.total, 0);

  function handleBarClick(date: string) {
    setDrill((prev) => prev?.type === "day" && prev.date === date ? null : { type: "day", date });
  }

  function handleUserClick(userId: string) {
    setDrill((prev) => prev?.type === "user" && prev.userId === userId ? null : { type: "user", userId });
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 16px 48px" }}>
      <style>{`
        @media (max-width: 600px) {
          .dash-top-row { grid-template-columns: 1fr !important; }
          .dash-mid-row { grid-template-columns: 1fr !important; }
          .dash-credits-row { grid-template-columns: 1fr !important; }
        }
        @media (prefers-color-scheme: light) {
          .dash-wrap { background: #f5f6fa; color: #111; }
          .dash-wrap .card { background: #fff; border-color: #e0e0e0; }
        }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Creator Cost Dashboard</h1>
          <span style={{ fontSize: 11, background: "var(--warn)", color: "#fff", borderRadius: 4, padding: "2px 7px", marginTop: 4, display: "inline-block" }}>
            SAMPLE DATA
          </span>
        </div>
        <div role="group" aria-label="Time range" style={{ display: "flex", gap: 4 }}>
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => { setRange(r); setDrill(null); }}
              style={{
                padding: "5px 12px",
                borderRadius: 8,
                border: "1px solid",
                fontSize: 13,
                cursor: "pointer",
                background: range === r ? "var(--accent)" : "var(--card)",
                color: range === r ? "var(--accent-ink)" : "var(--muted)",
                borderColor: range === r ? "var(--accent)" : "var(--line)",
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
        {[
          { color: "var(--accent)", label: "Script" },
          { color: "var(--good)", label: "Speech" },
          { color: "var(--warn)", label: "Image" },
        ].map(({ color, label }) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--muted)" }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block" }} />
            {label}
          </span>
        ))}
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--warn)" }}>
          <span style={{ width: 20, height: 2, background: "var(--warn)", display: "inline-block" }} /> $2.00 ceiling
        </span>
      </div>

      {/* Top row: stacked bar + cost KPI */}
      <div className="dash-top-row" style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 12, marginBottom: 12 }}>
        <div className="card" style={{ padding: 12 }}>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--muted)" }}>Spend / day — {range}</p>
          <StackedBarChart data={days} ceiling={CEILING} />
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--muted)", textAlign: "right" }}>
            Total in range: <strong>{usd(totalCost)}</strong>
          </p>
        </div>

        <div className="card" style={{ padding: 12 }}>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--muted)" }}>Cost / recording</p>
          <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em" }}>{usd(cpr.avg)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
            <Sparkline values={cpr.sparkline} />
            <span style={{ fontSize: 11, color: cpr.trend > 0 ? "var(--warn)" : "var(--good)" }}>
              {cpr.trend > 0 ? "▲" : "▼"} {usd(Math.abs(cpr.trend))} vs prior
            </span>
          </div>
        </div>
      </div>

      {/* Second row: line chart + horizontal bars */}
      <div className="dash-mid-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div className="card" style={{ padding: 12 }}>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--muted)" }}>
            Revenue <span style={{ color: "var(--good)" }}>━</span> vs Cost <span style={{ color: "var(--warn)" }}>━</span>
          </p>
          <LineChart data={rcDays} />
        </div>

        <div className="card" style={{ padding: 12 }}>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--muted)" }}>Top users by cost — click to drill down</p>
          <HBarChart data={users} onClickUser={handleUserClick} />
        </div>
      </div>

      {/* Credits row */}
      <div className="dash-credits-row" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>
        {[
          { label: "Credits bought", value: credits.bought, color: "var(--good)" },
          { label: "Credits spent", value: credits.spent, color: "var(--warn)" },
          { label: "Outstanding", value: credits.outstanding, color: "var(--accent-text)" },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color }}>{usd(value)}</div>
          </div>
        ))}
      </div>

      {/* Drill-down */}
      {drill && <DrillTable target={drill} range={range} />}
    </div>
  );
}
