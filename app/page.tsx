"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hashOf, neutralScript, titleFor, VARIANT_COUNT } from "@/lib/script";
import { FREE_ANON_GENERATIONS } from "@/lib/architecture";
import Link from "next/link";
import { DEFAULT_VOICE_ID, resolveVoice } from "@/lib/voices";
import { readVoiceChoice } from "@/lib/voiceStore";
import { readPaceChoice, readToneChoice } from "@/lib/deliveryStore";
import { lineStarts, startPad } from "@/lib/audio";
import { newId } from "@/lib/library/model";
import { getStore } from "@/lib/library/useLibrary";
import Onboarding from "@/app/components/Onboarding";

type Stage = "form" | "making" | "player";

const EXAMPLES = [
  "I want to be calm and confident when I speak",
  "a healthy, strong body that I enjoy living in",
  "to run my own business doing work I love",
  "a loving, easy relationship with my family",
];

type Made = { lines: string[]; url: string; voiceId: string; voiceName: string; source: string; starts?: number[] };

/** The server's line start times, if present and sound; null makes the page estimate instead. */
function readStarts(header: string | null, count: number): number[] | undefined {
  try {
    const v = JSON.parse(header ?? "null");
    const ok = Array.isArray(v) && v.length === count && v.every((n) => typeof n === "number" && n >= 0 && n <= 1);
    return ok ? v : undefined;
  } catch {
    return undefined;
  }
}

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

export default function DemoPage() {
  const [stage, setStage] = useState<Stage>("form");
  const [want, setWant] = useState("");
  const [name, setName] = useState("");
  const [variant, setVariant] = useState(0);
  const [step, setStep] = useState(0);
  // A recording made by the server for this wish. Null means the free
  // fallback: a template script read by the device's own voice.
  const [made, setMade] = useState<Made | null>(null);
  const [note, setNote] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const [used, setUsed] = useState(0);
  const [gate, setGate] = useState(false);
  const [shared, setShared] = useState(false);
  // The library id once this result is saved; cleared when a new one is made.
  const [savedId, setSavedId] = useState("");
  const [saving, setSaving] = useState(false);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState("");
  // The voice chosen in Settings. Read after load; the demo itself still speaks
  // with the device's voice.
  const [studioVoice, setStudioVoice] = useState(() => resolveVoice(DEFAULT_VOICE_ID));
  useEffect(() => {
    setStudioVoice(resolveVoice(readVoiceChoice()));
  }, []);
  const [canSpeak, setCanSpeak] = useState(true);
  const [music, setMusic] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [idx, setIdx] = useState(-1);
  const [toast, setToast] = useState("");

  const token = useRef(0);
  const stopPad = useRef<(() => void) | null>(null);

  // Without a server recording the device reads a general script. It never
  // reads the typed wish back: only the server's text model vets a wish.
  const lines = useMemo(() => made?.lines ?? neutralScript(name.trim()), [made, name]);
  const hue = useMemo(() => hashOf(want + variant) % 360, [want, variant]);
  // Voices, free counter, and shared links.
  useEffect(() => {
    setUsed(readCount());
    const p = new URLSearchParams(window.location.search);
    const w = p.get("w");
    if (w) {
      setWant(w.slice(0, 280));
      setName((p.get("n") ?? "").slice(0, 40));
      // A shared link only fills in the form. Nothing plays until Create.
      setShared(true);
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

  // Leaving the page always ends playback, with or without a speech engine:
  // the token bump silences pending read-along timers, and the pad stops.
  useEffect(
    () => () => {
      token.current++;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      audio.current?.pause();
      audio.current = null;
      stopPad.current?.();
      stopPad.current = null;
    },
    [],
  );
  // A recording lives only in this tab. Free its memory when it is replaced.
  useEffect(() => () => void (made && URL.revokeObjectURL(made.url)), [made]);

  const stop = useCallback(() => {
    token.current++;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    audio.current?.pause();
    audio.current = null;
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

    // A server recording: play the file and move the read-along by its clock.
    if (made) {
      const a = new Audio(made.url);
      audio.current = a;
      // With pauses, the server knows where each line starts; otherwise estimate by length.
      const starts = made.starts ?? lineStarts(lines);
      a.ontimeupdate = () => {
        if (token.current !== mine || !a.duration) return;
        const at = a.currentTime / a.duration;
        let i = 0;
        while (i + 1 < starts.length && starts[i + 1] <= at) i++;
        setIdx(i);
      };
      a.onended = () => {
        if (token.current !== mine) return;
        stop();
        setIdx(lines.length);
      };
      a.onerror = () => {
        if (token.current !== mine) return;
        stop();
        setToast("The recording could not be played.");
      };
      void a.play().catch(() => token.current === mine && stop());
      return;
    }

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
  }, [canSpeak, lines, made, music, stop, voiceURI]);

  // One request writes the script and records it. If recording is off, over
  // its limits or fails, the free fallback still gives the visitor something:
  // a template script in the device's own voice.
  const run = useRef(0);
  const generate = async (v: number) => {
    stop();
    const mine = ++run.current;
    setStage("making");
    setStep(0);
    setNote("");
    setIdx(-1);
    let next: Made | null = null;
    let why = "";
    try {
      const res = await fetch("/api/manifest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          want: want.trim(),
          name: name.trim(),
          voiceId: studioVoice.id,
          variant: v,
          pace: readPaceChoice(),
          tone: readToneChoice(),
        }),
      });
      if (res.ok) {
        const packed = atob(res.headers.get("X-Script") ?? "");
        const made = JSON.parse(new TextDecoder().decode(Uint8Array.from(packed, (c) => c.charCodeAt(0))));
        if (!Array.isArray(made) || !made.every((l) => typeof l === "string")) throw new Error("bad script");
        next = {
          lines: made,
          url: URL.createObjectURL(await res.blob()),
          voiceId: resolveVoice(res.headers.get("X-Voice-Id")).id,
          voiceName: resolveVoice(res.headers.get("X-Voice-Id")).name,
          source: res.headers.get("X-Script-Source") ?? "",
          starts: readStarts(res.headers.get("X-Line-Starts"), made.length),
        };
      } else {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        why = j?.error ?? "Recording is not available just now.";
      }
    } catch {
      why = "The recording could not be made just now.";
    }
    if (run.current !== mine) {
      if (next) URL.revokeObjectURL(next.url);
      return;
    }
    setMade(next);
    setSavedId("");
    setNote(
      !next
        ? `${why} Here is a general version in your device's own voice.`
        : next.source === "template"
          ? "A personal script could not be written just now, so this is a general one."
          : "",
    );
    setStage("player");
  };

  const create = () => {
    if (!want.trim()) return;
    if (used >= FREE_ANON_GENERATIONS) {
      setGate(true);
      return;
    }
    setGate(false);
    setShared(false);
    setVariant(0);
    const n = used + 1;
    setUsed(n);
    writeCount(n);
    void generate(0);
  };

  // While waiting, tick the first step after a moment. The request does both.
  useEffect(() => {
    if (stage !== "making" || step > 0) return;
    const t = setTimeout(() => setStep(1), 3000);
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
    const v = (variant + 1) % VARIANT_COUNT;
    setVariant(v);
    void generate(v);
  };

  const share = async () => {
    const u = new URL(window.location.origin);
    u.searchParams.set("w", want.trim());
    if (name.trim()) u.searchParams.set("n", name.trim());
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

  // Keeps this result in the library on this device: script, title and recording.
  const save = async () => {
    if (saving || savedId) return;
    setSaving(true);
    try {
      const audio = made ? await (await fetch(made.url)).blob() : null;
      const now = Date.now();
      const id = newId();
      await getStore().saveManifestation(
        {
          id,
          // The general fallback is not about the wish, so its title is not either.
          title: made ? titleFor(want) : "A moment of calm",
          want: want.trim(),
          firstName: name.trim(),
          lines,
          voiceId: made?.voiceId ?? "",
          voiceName: made?.voiceName ?? "Device voice",
          hasAudio: !!audio,
          createdAt: now,
          updatedAt: now,
        },
        audio,
      );
      setSavedId(id);
      setToast("Saved to your library.");
    } catch {
      setToast("Could not save on this device.");
    }
    setSaving(false);
    setTimeout(() => setToast(""), 2500);
  };

  const reset = () => {
    stop();
    run.current++;
    setMade(null);
    setNote("");
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
        <Onboarding />
        <h1>Type what you want. Hear it as already yours.</h1>
        <p className="lede">
          {shared ? "Someone shared this wish with you. Tap Create to hear it. " : ""}
          No sign-up. One tap. A short affirmation written and recorded for you.
        </p>
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
              <label htmlFor="voice">Backup device voice</label>
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
          <p className="small muted voiceline">
            Recorded in the voice of <b>{studioVoice.name}</b>. <Link href="/settings">Change voice</Link>
          </p>
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
    const steps = ["Writing your script in “You” statements", `Recording it in the voice of ${studioVoice.name}`];
    return (
      <>
        <h1>Making it yours…</h1>
        <p className="lede">This takes up to half a minute. Keep this page open.</p>
        <div className="card">
          <ul className="steps" aria-live="polite">
            {steps.map((label, i) => (
              <li key={label} className={i < step ? "done" : i === step ? "on" : ""}>
                <span>
                  {i < step ? "✓ " : i === step ? "… " : ""}
                  {label}
                </span>
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
        {idx >= lines.length ? "Finished. Play it again, or try a new variation." : "Tap play, close your eyes."}
      </p>
      {note && <p className="small muted">{note}</p>}

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
        {savedId ? (
          <Link className="btn sm" href={`/library/${savedId}`}>
            ✓ Saved
          </Link>
        ) : (
          <button className="btn sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        )}
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
      {!made && !canSpeak && (
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

      <p className="small muted">
        {made
          ? `Recorded in the voice of ${made.voiceName}. ${savedId ? "Saved in your library on this device." : "Not kept unless you tap Save."}`
          : "Read by your device's own voice. Nothing was recorded."}
      </p>

      {(gate || idx >= lines.length || left === 0) && <Gate />}

      <p className="banner">
        <button
          className="chip"
          onClick={() => {
            stop();
            run.current++;
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
