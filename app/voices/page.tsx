"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BAKEOFF, OFF_ROUTER, ONE_MINUTE_CHARS, SAMPLE_WANT, tierFor } from "@/lib/bakeoff";
import { buildScript } from "@/lib/script";
import samplesJson from "@/lib/voiceSamples.json";

type Model = { id: string; name: string; usdPerMChars: number | null; voices: string[] };
type Status = {
  environment: string;
  paidCallsAllowed: boolean;
  keyPresent: boolean;
  keyValid?: boolean | null;
  limit?: number | null;
  limitRemaining?: number | null;
  usage?: number | null;
};
type Sample = { model: string; voice: string; file: string; chars: number; costUsd: number | null };
type Clip = { url: string; cost: number | null; key: string };

const SAMPLES = samplesJson as Sample[];
const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const MAX = 1000;

/** Per-1M-character price: the list price, or one worked out from a measured sample. */
function pricePerM(m: Model, sample?: Sample): { value: number | null; measured: boolean } {
  if (m.usdPerMChars !== null) return { value: m.usdPerMChars, measured: false };
  if (sample?.costUsd != null && sample.chars > 0) return { value: (sample.costUsd / sample.chars) * 1e6, measured: true };
  return { value: null, measured: false };
}

export default function VoicesPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [models, setModels] = useState<Model[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [want, setWant] = useState(SAMPLE_WANT);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [voice, setVoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<Record<string, string>>({});
  const [clips, setClips] = useState<Record<string, Clip>>({});
  const [spent, setSpent] = useState(0);
  const cache = useRef(new Map<string, Clip>());

  const refreshStatus = () =>
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));

  useEffect(() => {
    void refreshStatus();
    fetch("/api/voices")
      .then((r) => r.json())
      .then((d) => (d.models ? setModels(d.models) : setLoadError(d.error ?? "Could not load voices.")))
      .catch(() => setLoadError("Could not load voices."));
  }, []);

  // The script is the free template writer for now; edit it freely.
  useEffect(() => {
    setText(buildScript(want, name, 0).join(" "));
  }, [want, name]);

  // Cheapest first; models with no known price go last.
  const rows = useMemo(() => {
    const found = BAKEOFF.map((b) => {
      const m = models?.find((x) => x.id === b.model);
      const sample = SAMPLES.find((s) => s.model === b.model);
      return m ? { ...b, m, sample, price: pricePerM(m, sample) } : null;
    }).filter((r): r is NonNullable<typeof r> => r !== null);
    return found.sort((a, b) => (a.price.value ?? Infinity) - (b.price.value ?? Infinity));
  }, [models]);

  const chars = text.trim().length;
  const canSpend = Boolean(status?.keyPresent && status.keyValid !== false && status.paidCallsAllowed);

  const generate = async (model: string, v: string, perM: number | null) => {
    const key = `${model}|${v}|${text.trim()}`;
    setError((e) => ({ ...e, [model]: "" }));
    const hit = cache.current.get(key);
    if (hit) {
      setClips((c) => ({ ...c, [model]: hit }));
      return;
    }
    setBusy((b) => ({ ...b, [model]: true }));
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, voice: v, text: text.trim() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Failed (${res.status}).`);
      }
      const blob = await res.blob();
      const est = res.headers.get("X-Est-Cost-Usd");
      const cost = est ? Number(est) : perM === null ? null : (chars * perM) / 1e6;
      const clip = { url: URL.createObjectURL(blob), cost, key };
      cache.current.set(key, clip);
      setClips((c) => ({ ...c, [model]: clip }));
      if (cost) setSpent((s) => s + cost);
      void refreshStatus();
    } catch (e) {
      setError((er) => ({ ...er, [model]: e instanceof Error ? e.message : "Failed." }));
    } finally {
      setBusy((b) => ({ ...b, [model]: false }));
    }
  };

  return (
    <>
      <h1>Voice bake-off</h1>
      <p className="lede">One script, ten voices, cheapest first. Press play and judge by ear.</p>

      {loadError && <p className="banner">{loadError}</p>}
      {!models && !loadError && <p className="banner">Loading prices…</p>}

      {rows.length > 0 && (
        <>
          <h2 style={{ marginTop: 8 }}>Cost at a glance</h2>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Voice model</th>
                  <th className="num">Per 1M characters</th>
                  <th className="num">1-minute affirmation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ model, m, price }) => (
                  <tr key={model}>
                    <td>{m.name}</td>
                    <td className="num">
                      {price.value === null ? "per token" : `${usd(price.value)}${price.measured ? "*" : ""}`}
                    </td>
                    <td className="num">
                      {price.value === null ? "n/a" : usd((ONE_MINUTE_CHARS * price.value) / 1e6)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ margin: "8px 0 0" }}>
            One minute is about {ONE_MINUTE_CHARS} characters. Prices are read live from OpenRouter.
            {rows.some((r) => r.price.measured) &&
              " * Priced per token of audio; this figure is worked out from what the sample clip cost."}
          </p>
        </>
      )}

      <h2>Listen</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Each voice has a ready-made sample of the same script, so listening costs nothing. To hear your
        own words, edit the script below and press Generate.
      </p>

      {rows.map(({ model, voice: def, note, m, sample, price }) => {
        const noVoices = m.voices.length === 0;
        const v = noVoices ? "" : voice[model] ?? (m.voices.includes(def) ? def : m.voices[0]);
        const list = m.voices.filter((x) => !/^[a-z]{2}-[A-Z]{2}-/.test(x) || x.startsWith("en-"));
        const est = price.value === null ? null : (chars * price.value) / 1e6;
        const clip = clips[model];
        const stale = clip && clip.key !== `${model}|${v}|${text.trim()}`;
        return (
          <div className="card voice" key={model}>
            <div className="voicehead">
              <span className="pill pick">{tierFor(m.usdPerMChars)}</span>
              <h3>{m.name}</h3>
              <p className="small muted" style={{ margin: 0 }}>
                {price.value === null
                  ? "priced per token"
                  : `${usd(price.value)}${price.measured ? "*" : ""} per 1M characters · 1 minute ≈ ${usd(
                      (ONE_MINUTE_CHARS * price.value) / 1e6,
                    )}`}
                {note && ` · ${note}`}
              </p>
            </div>
            {sample && (
              <>
                <p className="small muted" style={{ margin: "10px 0 4px" }}>
                  Sample{sample.voice && `, voice ${sample.voice.split(":")[0]}`}
                  {sample.costUsd != null && ` · cost ${usd(sample.costUsd)} to make`}
                </p>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio controls preload="none" src={sample.file} style={{ width: "100%" }} />
              </>
            )}
            <div className="controls">
              {noVoices ? (
                <span className="small muted" style={{ flex: "1 1 150px" }}>
                  Default voice
                </span>
              ) : (
                <select
                  aria-label={`Voice for ${m.name}`}
                  value={v}
                  style={{ flex: "1 1 150px", width: "auto" }}
                  onChange={(e) => setVoice((s) => ({ ...s, [model]: e.target.value }))}
                >
                  {list.map((x) => (
                    <option key={x} value={x}>
                      {x.split(":")[0]}
                    </option>
                  ))}
                </select>
              )}
              <button
                className="btn primary sm"
                disabled={!canSpend || !chars || busy[model]}
                onClick={() => generate(model, v, price.value)}
              >
                {busy[model] ? "Generating…" : clip && !stale ? "Ready below" : est !== null ? `Generate (${usd(est)})` : "Generate"}
              </button>
            </div>
            {error[model] && (
              <p className="small" style={{ color: "var(--warn)", margin: "6px 0 0" }}>
                {error[model]}
              </p>
            )}
            {clip && (
              <>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio controls src={clip.url} style={{ width: "100%", marginTop: 10 }} />
                {stale && (
                  <p className="small muted" style={{ margin: "6px 0 0" }}>
                    This clip is from the earlier text or voice.
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}

      <h2>Your own script</h2>
      <div className="meter" style={{ marginTop: 0 }}>
        {status === null ? (
          <span>Checking the OpenRouter key…</span>
        ) : !status.paidCallsAllowed ? (
          <span>
            <b style={{ color: "var(--warn)" }}>Generate is switched off here.</b> The live site cannot
            spend. The samples above still play; use the preview link to generate new clips.
          </span>
        ) : !status.keyPresent ? (
          <span>
            <b style={{ color: "var(--warn)" }}>No key.</b> <code>OPENROUTER_API_KEY</code> is not set for
            the {status.environment} environment, so nothing can be generated yet.
          </span>
        ) : status.keyValid === false ? (
          <span>
            <b style={{ color: "var(--warn)" }}>Key rejected</b> by OpenRouter.
          </span>
        ) : (
          <>
            <span>
              Key OK. Budget left on this key:{" "}
              {status.limitRemaining == null ? "no limit set" : `${usd(status.limitRemaining)} of ${usd(status.limit ?? 0)}`}
              . Spent on this page: {usd(spent)}.
            </span>
            <b>{status.limitRemaining == null ? "" : usd(status.limitRemaining)}</b>
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ marginTop: 0 }}>
          <div>
            <label htmlFor="want">What do you want?</label>
            <input id="want" type="text" value={want} maxLength={280} onChange={(e) => setWant(e.target.value)} />
          </div>
          <div>
            <label htmlFor="name" style={{ marginTop: 0 }}>
              First name (optional)
            </label>
            <input id="name" type="text" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <label htmlFor="text">Script that will be spoken ({chars} characters, max {MAX})</label>
        <textarea id="text" value={text} maxLength={MAX} style={{ minHeight: 150 }} onChange={(e) => setText(e.target.value)} />
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          This script comes from the free template writer. Changing the text or the voice makes a new
          clip; replaying a clip is free.
        </p>
      </div>

      <h2>Not on OpenRouter</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        These were checked and left out: each needs its own account and key, and none is cheaper than
        the voices above. List prices from third-party price trackers, November 2026; not verified on
        the vendors&rsquo; own pages.
      </p>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th className="num">Per 1M characters</th>
            </tr>
          </thead>
          <tbody>
            {OFF_ROUTER.map((o) => (
              <tr key={o.name}>
                <td>
                  {o.name}
                  {o.note && <span className="muted small"> · {o.note}</span>}
                </td>
                <td className="num">{o.usdPerMChars}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
