"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildScript } from "@/lib/script";

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

// One row per price tier. The voice named here is the default; any voice the
// model offers can be picked.
const TIERS: Array<{ tier: string; model: string; voice: string }> = [
  { tier: "Cheap", model: "hexgrad/kokoro-82m", voice: "af_heart" },
  { tier: "Low", model: "heygen/heygen-voice-1-turbo", voice: "nadine" },
  { tier: "Mid", model: "x-ai/grok-voice-tts-1.0", voice: "eve" },
  { tier: "Mid", model: "microsoft/mai-voice-2.1-flash", voice: "en-US-Harper:MAI-Voice-2.1-Flash" },
  { tier: "Premium", model: "elevenlabs/eleven-v4-turbo", voice: "george" },
  { tier: "Premium+", model: "elevenlabs/eleven-v4", voice: "george" },
];

const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const MAX = 1000;

type Clip = { url: string; cost: number | null; key: string };

export default function VoicesPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [models, setModels] = useState<Model[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [want, setWant] = useState("I want to be calm and confident when I speak");
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

  const rows = useMemo(
    () =>
      TIERS.map((t) => ({ ...t, m: models?.find((x) => x.id === t.model) })).filter(
        (r): r is typeof r & { m: Model } => Boolean(r.m),
      ),
    [models],
  );

  const chars = text.trim().length;
  const canSpend = Boolean(status?.keyPresent && status.keyValid !== false && status.paidCallsAllowed);

  const generate = async (model: string, v: string, m: Model) => {
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
      const cost = est ? Number(est) : m.usdPerMChars === null ? null : (chars * m.usdPerMChars) / 1e6;
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
      <p className="lede">One script, several voices, the price of each. Judge by ear.</p>

      <div className="meter" style={{ marginTop: 0 }}>
        {status === null ? (
          <span>Checking the OpenRouter key…</span>
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

      {loadError && <p className="banner">{loadError}</p>}
      {!models && !loadError && <p className="banner">Loading voices…</p>}

      {rows.map(({ tier, model, voice: def, m }) => {
        const v = voice[model] ?? (m.voices.includes(def) ? def : m.voices[0] ?? def);
        const list = m.voices.filter((x) => !/^[a-z]{2}-[A-Z]{2}-/.test(x) || x.startsWith("en-"));
        const est = m.usdPerMChars === null ? null : (chars * m.usdPerMChars) / 1e6;
        const clip = clips[model];
        const stale = clip && clip.key !== `${model}|${v}|${text.trim()}`;
        return (
          <div className="card voice" key={model}>
            <div className="voicehead">
              <div>
                <span className="pill pick">{tier}</span>
                <h3>{m.name}</h3>
                <p className="small muted" style={{ margin: 0 }}>
                  {m.usdPerMChars === null ? "priced per token" : `${usd(m.usdPerMChars)} per 1M characters`}
                  {est !== null && ` · this clip ${usd(est)}`}
                  {est !== null && chars > 0 && ` · 10 minutes ≈ ${usd((9000 * (m.usdPerMChars ?? 0)) / 1e6)}`}
                </p>
              </div>
            </div>
            <div className="controls">
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
              <button
                className="btn primary sm"
                disabled={!canSpend || !chars || busy[model]}
                onClick={() => generate(model, v, m)}
              >
                {busy[model] ? "Generating…" : clip && !stale ? "Replay ready" : "Generate"}
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
                {stale && <p className="small muted" style={{ margin: "6px 0 0" }}>This clip is from the earlier text or voice.</p>}
              </>
            )}
          </div>
        );
      })}

      <p className="banner">
        Prices are read live from OpenRouter&rsquo;s model list. Costs shown are characters × list price; the
        key&rsquo;s remaining budget above is the authoritative number.
      </p>
    </>
  );
}
