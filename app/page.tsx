"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildScript, hashOf, titleFor, VARIANT_COUNT } from "@/lib/script";
import { DEMO_UNIT_COST, FREE_ANON_GENERATIONS } from "@/lib/architecture";

type Stage = "form" | "making" | "player";

const EXAMPLES = [
  "I want to be calm and confident when I speak",
  "a healthy, strong body that I enjoy living in",
  "to run my own business doing work I love",
  "a loving, easy relationship with my family",
];

const STEPS = [
  { label: "Writing your script in “You” statements", key: "script" as const },
  { label: "Recording the voice", key: "voice" as const },
  { label: "Painting the visual", key: "image" as const },
];

const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

function readCount(): number {
  try {
    return Number(window.localStorage.getItem("nv_free") ?? "0") || 0;
  } catch {
    return 0;
  }
}
function writeCount(n: number) {
  try {
    window.localStorage.setItem("nv_free", String(n));
  } catch {
    /* private mode: the counter just resets */
  }
}

/** Soft ambient pad made with WebAudio, so the prototype ships no audio files. */
function startPad(): () => void {
  const Ctx: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return () => {};
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  master.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 3);
  const oscs = [110, 164.81, 220.6, 277.18].map((f, i) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.9 : 0.35;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05 + i * 0.03;
    const lg = ctx.createGain();
    lg.gain.value = 0.25;
    lfo.connect(lg).connect(g.gain);
    o.connect(g).connect(master);
    o.start();
    lfo.start();
    return [o, lfo];
  });
  return () => {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
    setTimeout(() => {
      oscs.flat().forEach((o) => o.stop());
      void ctx.close();
    }, 700);
  };
}

export default function DemoPage() {
  const [stage, setStage] = useState<Stage>("form");
  const [want, setWant] = useState("");
  const [name, setName] = useState("");
  const [variant, setVariant] = useState(0);
  const [step, setStep] = useState(0);
  const [used, setUsed] = useState(0);
  const [gate, setGate] = useState(false);
  const [shared, setShared] = useState(false);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState("");
  const [canSpeak, setCanSpeak] = useState(true);
  const [music, setMusic] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [idx, setIdx] = useState(-1);
  const [toast, setToast] = useState("");

  const token = useRef(0);
  const stopPad = useRef<(() => void) | null>(null);

  const lines = useMemo(() => buildScript(want, name, variant), [want, name, variant]);
  const chars = useMemo(() => lines.join(" ").length, [lines]);
  const hue = useMemo(() => hashOf(want + variant) % 360, [want, variant]);
  const cost = useMemo(() => {
    const voice = (chars / 1000) * DEMO_UNIT_COST.ttsPer1kChars;
    return {
      script: DEMO_UNIT_COST.script,
      voice,
      image: DEMO_UNIT_COST.image,
      total: DEMO_UNIT_COST.script + voice + DEMO_UNIT_COST.image,
    };
  }, [chars]);

  // Voices, free counter, and shared links.
  useEffect(() => {
    setUsed(readCount());
    const p = new URLSearchParams(window.location.search);
    const w = p.get("w");
    if (w) {
      setWant(w.slice(0, 280));
      setName((p.get("n") ?? "").slice(0, 40));
      const v = Number(p.get("v") ?? "0");
      setVariant(Number.isSafeInteger(v) ? v : 0);
      setShared(true);
      setStage("player");
    }
    if (!("speechSynthesis" in window)) {
      setCanSpeak(false);
      return;
    }
    const load = () => {
      const all = window.speechSynthesis.getVoices();
      const lang = (navigator.language || "en").slice(0, 2);
      const mine = all.filter((v) => v.lang.toLowerCase().startsWith(lang));
      const list = (mine.length ? mine : all).slice(0, 40);
      setVoices(list);
      setVoiceURI((cur) => cur || list.find((v) => v.default)?.voiceURI || list[0]?.voiceURI || "");
    };
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", load);
      window.speechSynthesis.cancel();
      stopPad.current?.();
    };
  }, []);

  const stop = useCallback(() => {
    token.current++;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    stopPad.current?.();
    stopPad.current = null;
    setPlaying(false);
  }, []);

  // Must run inside the tap handler: mobile browsers only allow speech and
  // audio that start from a user gesture. All lines are queued at once.
  const play = useCallback(() => {
    stop();
    const mine = ++token.current;
    setPlaying(true);
    setIdx(0);
    if (music) stopPad.current = startPad();

    // No working speech engine: step through the lines on a timer instead.
    const readAlong = (from: number) => {
      const rest = lines.slice(from);
      const dur = (l: string) => 1200 + l.length * 70;
      rest.forEach((_l, i) => {
        const at = rest.slice(0, i).reduce((t, l) => t + dur(l), 0);
        setTimeout(() => token.current === mine && setIdx(from + i), at);
      });
      const total = rest.reduce((t, l) => t + dur(l), 0);
      setTimeout(() => {
        if (token.current !== mine) return;
        stop();
        setIdx(lines.length);
      }, total);
    };

    if (!canSpeak) {
      readAlong(0);
      return;
    }

    const synth = window.speechSynthesis;
    let failed = false;
    const voice = synth.getVoices().find((v) => v.voiceURI === voiceURI);
    lines.forEach((text, i) => {
      const u = new SpeechSynthesisUtterance(text);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      }
      u.rate = 0.82;
      u.pitch = 0.95;
      u.onstart = () => token.current === mine && setIdx(i);
      u.onerror = (e) => {
        // cancel() reports these two; anything else means the engine failed.
        if (failed || token.current !== mine || e.error === "canceled" || e.error === "interrupted") return;
        failed = true; // every queued line reports its own error; fall back once
        synth.cancel();
        setCanSpeak(false);
        readAlong(i);
      };
      if (i === lines.length - 1) {
        u.onend = () => {
          if (token.current !== mine) return;
          stop();
          setIdx(lines.length);
        };
      }
      synth.speak(u);
    });
  }, [canSpeak, lines, music, stop, voiceURI]);

  const create = () => {
    if (!want.trim()) return;
    if (used >= FREE_ANON_GENERATIONS) {
      setGate(true);
      return;
    }
    setGate(false);
    setShared(false);
    setVariant(0);
    setStage("making");
    setStep(0);
    const n = used + 1;
    setUsed(n);
    writeCount(n);
  };

  useEffect(() => {
    if (stage !== "making") return;
    if (step >= STEPS.length) {
      const t = setTimeout(() => {
        setIdx(-1);
        setStage("player");
      }, 350);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep((s) => s + 1), 800);
    return () => clearTimeout(t);
  }, [stage, step]);

  const newVariation = () => {
    stop();
    if (used >= FREE_ANON_GENERATIONS) {
      setGate(true);
      return;
    }
    const n = used + 1;
    setUsed(n);
    writeCount(n);
    setVariant((v) => (v + 1) % VARIANT_COUNT);
    setIdx(-1);
  };

  const share = async () => {
    const u = new URL(window.location.origin);
    u.searchParams.set("w", want.trim());
    if (name.trim()) u.searchParams.set("n", name.trim());
    if (variant) u.searchParams.set("v", String(variant));
    try {
      if (navigator.share) await navigator.share({ title: titleFor(want), url: u.toString() });
      else {
        await navigator.clipboard.writeText(u.toString());
        setToast("Link copied.");
      }
    } catch {
      setToast("Could not share from this browser.");
    }
    setTimeout(() => setToast(""), 2500);
  };

  const reset = () => {
    stop();
    writeCount(0);
    setUsed(0);
    setGate(false);
    setShared(false);
    setStage("form");
    window.history.replaceState(null, "", "/");
  };

  const left = Math.max(0, FREE_ANON_GENERATIONS - used);

  if (stage === "form") {
    return (
      <>
        <h1>Type what you want. Hear it as already yours.</h1>
        <p className="lede">No sign-up. One tap. About a minute of audio made for you.</p>
        <div className="card">
          <label htmlFor="want">What do you want?</label>
          <textarea
            id="want"
            value={want}
            maxLength={280}
            placeholder="I want to be calm and confident when I speak"
            onChange={(e) => setWant(e.target.value)}
          />
          <div className="chips" aria-label="Examples">
            {EXAMPLES.map((e) => (
              <button key={e} type="button" className="chip" onClick={() => setWant(e)}>
                {e}
              </button>
            ))}
          </div>
          <div className="row">
            <div>
              <label htmlFor="name">Your first name (optional)</label>
              <input
                id="name"
                type="text"
                value={name}
                maxLength={40}
                autoComplete="given-name"
                placeholder="Tim"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="voice">Voice</label>
              <select
                id="voice"
                value={voiceURI}
                disabled={!voices.length}
                onChange={(e) => setVoiceURI(e.target.value)}
              >
                {!voices.length && <option>Browser default</option>}
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn primary block" disabled={!want.trim()} onClick={create}>
            Create my manifestation
          </button>
          <p className="banner">
            {left > 0
              ? `${left} free ${left === 1 ? "creation" : "creations"} left without an account.`
              : "You have used your free creations."}{" "}
            {used > 0 && (
              <button className="chip" onClick={reset}>
                Reset demo
              </button>
            )}
          </p>
          {gate && <Gate />}
        </div>
      </>
    );
  }

  if (stage === "making") {
    return (
      <>
        <h1>Making it yours…</h1>
        <p className="lede">
          In the real app each step is one metered call through the model router. Here
          they are simulated.
        </p>
        <div className="card">
          <ul className="steps">
            {STEPS.map((s, i) => (
              <li key={s.key} className={i < step ? "done" : i === step ? "on" : ""}>
                <span>
                  {i < step ? "✓ " : i === step ? "… " : ""}
                  {s.label}
                </span>
                <span className="cost">{usd(cost[s.key])}</span>
              </li>
            ))}
          </ul>
        </div>
      </>
    );
  }

  const current = idx >= 0 && idx < lines.length ? lines[idx] : null;

  return (
    <>
      <h1>{titleFor(want)}</h1>
      <p className="lede">
        {shared ? "Shared with you. " : ""}
        {idx >= lines.length ? "Finished. Play it again, or try a new variation." : "Tap play, close your eyes."}
      </p>

      <div
        className={`visual${playing ? " playing" : ""}`}
        style={
          {
            "--h1": hue,
            "--h2": (hue + 60) % 360,
            "--h3": (hue + 300) % 360,
          } as React.CSSProperties
        }
      >
        <div className="blob" />
        <div className="line" aria-live="polite">
          {current ?? (idx >= lines.length ? "And so it is." : "")}
        </div>
        <span className="tag">Generated image goes here</span>
      </div>

      <div className="controls">
        {playing ? (
          <button className="btn primary" onClick={stop}>
            ■ Stop
          </button>
        ) : (
          <button className="btn primary" onClick={play}>
            ▶ {idx >= lines.length ? "Play again" : "Play"}
          </button>
        )}
        <button className="btn sm" onClick={newVariation}>
          New variation
        </button>
        <button className="btn sm" onClick={share}>
          Share
        </button>
        <button
          className="btn sm ghost"
          aria-pressed={music}
          onClick={() => {
            setMusic((m) => !m);
            if (playing) stop();
          }}
        >
          Music: {music ? "on" : "off"}
        </button>
      </div>
      <div className="toast" role="status">
        {toast}
      </div>
      {!canSpeak && (
        <p className="small muted">
          This browser has no built-in speech, so the lines are shown in time instead.
        </p>
      )}

      <ol className="script">
        {lines.map((l, i) => (
          <li key={i} className={i === idx ? "now" : i < idx ? "past" : ""}>
            {l}
          </li>
        ))}
      </ol>

      <div className="meter">
        <span>
          Real cost of this creation ({chars} characters of voice, 1 image). Replays are
          free: the audio is stored once.
        </span>
        <b>{usd(cost.total)}</b>
      </div>

      {(gate || idx >= lines.length || left === 0) && <Gate />}

      <p className="banner">
        <button
          className="chip"
          onClick={() => {
            stop();
            setStage("form");
            setShared(false);
          }}
        >
          ← Create another
        </button>{" "}
        <button className="chip" onClick={reset}>
          Reset demo
        </button>
      </p>
    </>
  );
}

function Gate() {
  const [msg, setMsg] = useState(false);
  return (
    <div className="gate">
      <h3>Keep this, in a voice you choose</h3>
      <p className="muted">
        A free account saves your manifestations and plays them back to back. A
        subscription adds studio voices, daily variations, images and music.
      </p>
      <button className="btn primary" onClick={() => setMsg(true)}>
        Create a free account
      </button>
      {msg && (
        <p className="small muted" style={{ marginTop: 10 }}>
          Sign-up and payment are not wired in this prototype. This is where Demo 1 hands
          over to account creation, then to the paywall.
        </p>
      )}
    </div>
  );
}
