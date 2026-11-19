"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AUDIO_TOKENS_PER_MINUTE, BAKEOFF, OFF_ROUTER, OTHER_MODELS, ONE_MINUTE_CHARS, SAMPLE_WANT, tierFor } from "@/lib/bakeoff";
import { buildScript } from "@/lib/script";
import samplesJson from "@/lib/voiceSamples.json";

type Model = { id: string; name: string; usdPerMChars: number | null; voices: string[]; pricing?: Record<string, string> };
type Status = {
  environment: string;
  paidCallsAllowed: boolean;
  keyPresent: boolean;
  keyValid?: boolean | null;
  limit?: number | null;
  limitRemaining?: number | null;
  usage?: number | null;
};
type Sample = { model: string; voice: string; file: string; expressiveFile?: string };
type Clip = { url: string; cost: number | null; key: string };

const SAMPLES = samplesJson as Sample[];
const usd = (n: number) => (n === 0 ? "Free" : n < 0.1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const MAX = 1000;

/**
 * Per-1M-character price. Character-priced models use the list price. Token-priced
 * models (Gemini) are converted: one minute of audio is about 1,920 output tokens
 * (32 a second, which matched what a sample clip cost) plus the script as input.
 */
function pricePerM(m: Model): { value: number | null; estimated: boolean } {
  if (m.usdPerMChars !== null) return { value: m.usdPerMChars, estimated: false };
  if (m.id.endsWith(":free")) return { value: 0, estimated: false };
  const out = Number(m.pricing?.completion);
  const inp = Number(m.pricing?.prompt ?? 0);
  // Only Gemini's token rate is known; other token-priced models stay unconverted.
  if (!m.id.startsWith("google/") || !Number.isFinite(out) || out <= 0) return { value: null, estimated: false };
  const perMinute = AUDIO_TOKENS_PER_MINUTE * out + (ONE_MINUTE_CHARS / 4) * (Number.isFinite(inp) ? inp : 0);
  return { value: (perMinute / ONE_MINUTE_CHARS) * 1e6, estimated: true };
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
      return m ? { ...b, m, sample, price: pricePerM(m) } : null;
    }).filter((r): r is NonNullable<typeof r> => r !== null);
    return found.sort((a, b) => (a.price.value ?? Infinity) - (b.price.value ?? Infinity));
  }, [models]);

  // Every other speech model OpenRouter lists, so nothing is left out of view.
  const others = useMemo(() => {
    const inBakeoff = new Set(BAKEOFF.map((b) => b.model));
    return (models ?? [])
      .filter((m) => !inBakeoff.has(m.id))
      .map((m) => ({ m, price: pricePerM(m), info: OTHER_MODELS[m.id] }))
      .sort((a, b) => (a.price.value ?? Infinity) - (b.price.value ?? Infinity));
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
      <p className="lede">
        One script, {rows.length || "thirteen"} voices, cheapest first. Each plays plain and, where the model allows
        it, with expressive cues. Press play and judge by ear.
      </p>

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
                  <th>Expressive from the prompt?</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ model, m, price, expressive }) => (
                  <tr key={model}>
                    <td>{m.name}</td>
                    <td className="num">
                      {price.value === null ? "per token" : `${usd(price.value)}${price.estimated ? "*" : ""}`}
                    </td>
                    <td className="num">
                      {price.value === null ? "n/a" : usd((ONE_MINUTE_CHARS * price.value) / 1e6)}
                    </td>
                    <td>{expressive ? expressive.method : <span className="muted">None documented</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ margin: "8px 0 0" }}>
            One minute is about {ONE_MINUTE_CHARS} characters. Prices are read live from OpenRouter.
            {rows.some((r) => r.price.estimated) &&
              " * Priced per token of audio, converted at 32 tokens a second, which matched what a sample clip cost."}
          </p>
        </>
      )}

      <h2>Listen</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        Each voice has ready-made samples of the same script, so listening costs nothing. To hear your
        own words, edit the script below and press Generate. You can type a model&rsquo;s cues straight
        into the script.
      </p>

      {rows.map(({ model, voice: def, note, m, sample, price, expressive, why }) => {
        const noVoices = m.voices.length === 0;
        const v = noVoices ? "" : voice[model] ?? (m.voices.includes(def) ? def : m.voices[0]);
        const list = m.voices.filter((x) => !/^[a-z]{2}-[A-Z]{2}-/.test(x) || x.startsWith("en-"));
        const est = price.value === null ? null : (chars * price.value) / 1e6;
        const clip = clips[model];
        const stale = clip && clip.key !== `${model}|${v}|${text.trim()}`;
        return (
          <div className="card voice" key={model}>
            <div className="voicehead">
              <span className="pill pick">{tierFor(price.value)}</span>
              <h3>{m.name}</h3>
              <p className="small muted" style={{ margin: 0 }}>
                {price.value === null
                  ? "priced per token"
                  : `${usd(price.value)}${price.estimated ? "*" : ""} per 1M characters · 1 minute ≈ ${usd(
                      (ONE_MINUTE_CHARS * price.value) / 1e6,
                    )}`}
                {note && ` · ${note}`}
              </p>
            </div>
            {sample && (
              <>
                <p className="small muted" style={{ margin: "10px 0 4px" }}>
                  Plain{sample.voice && `, voice ${sample.voice.split(":")[0]}`}
                </p>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio controls preload="none" src={sample.file} style={{ width: "100%" }} />
              </>
            )}
            {expressive && sample?.expressiveFile && (
              <>
                <p className="small muted" style={{ margin: "10px 0 4px" }}>
                  With expressive cues
                </p>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio controls preload="none" src={sample.expressiveFile} style={{ width: "100%" }} />
              </>
            )}
            {expressive ? (
              <details className="cues">
                <summary>How it is steered: {expressive.method.toLowerCase()}</summary>
                <p className="small">
                  Syntax: <code>{expressive.syntax}</code>
                </p>
                <p className="small muted">
                  &ldquo;{expressive.quote}&rdquo;{" "}
                  <a href={expressive.url} target="_blank" rel="noreferrer">
                    Documentation
                  </a>
                </p>
                <p className="small muted" style={{ marginBottom: 4 }}>
                  {expressive.text ? "Script sent for the expressive sample:" : "Instruction sent with the unchanged script:"}
                </p>
                <p className="small cuetext">{expressive.text ?? expressive.instructions}</p>
              </details>
            ) : (
              <p className="small muted" style={{ margin: "10px 0 0" }}>
                {why ?? "No expressive control is documented."}
              </p>
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

      {others.length > 0 && (
        <>
          <h2>The rest of OpenRouter&rsquo;s speech list</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            The other {others.length} speech models on the same key, cheapest first. No samples were made
            for these.
          </p>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Voice model</th>
                  <th className="num">Per 1M characters</th>
                  <th className="num">1-minute affirmation</th>
                  <th>Expressive from the prompt?</th>
                  <th className="num">Limit per request</th>
                </tr>
              </thead>
              <tbody>
                {others.map(({ m, price, info }) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td className="num">
                      {price.value === null ? "not per character" : `${usd(price.value)}${price.estimated ? "*" : ""}`}
                    </td>
                    <td className="num">
                      {price.value === null ? "n/a" : usd((ONE_MINUTE_CHARS * price.value) / 1e6)}
                    </td>
                    <td>{info?.expressive ?? "Not stated"}</td>
                    <td className="num">{info?.limit ?? "not stated"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

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
