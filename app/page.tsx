"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { displayTitle, hashOf, neutralScript, scriptLines, toYouStatement, VARIANT_COUNT } from "@/lib/script";
import { FALLBACK_TITLE, noteForReason } from "@/lib/create";
import { FREE_ANON_GENERATIONS } from "@/lib/architecture";
import Link from "next/link";
import { DEFAULT_VOICE_ID, resolveVoice, voiceBlurb } from "@/lib/voices";
import { ensureModeVoice, readMode } from "@/lib/modeStore";
import { readVoiceChoice } from "@/lib/voiceStore";
import { advanceMix, peekMixVoice, readMixOn } from "@/lib/voiceMixStore";
import { readCadenceStepChoice, readPaceChoice, readSpeedStepChoice, readToneChoice } from "@/lib/deliveryStore";
import { REPEAT_MINUTES } from "@/lib/repetition";
import { composeSession, scriptOnly } from "@/lib/repetitionClient";
import { readBellOn, readRepeatMinutes, writeBellOn, writeRepeatMinutes } from "@/lib/repetitionStore";
import { startingDraft, writeDraft } from "@/lib/draftStore";
import { lineStarts } from "@/lib/audio";
import { CLOSING } from "@/lib/prompt";
import { DEFAULT_MUSIC, type Segment } from "@/lib/music";
import { MusicBed, prefetchMusic, speechOf } from "@/lib/musicBed";
import { readMusicChoice, readMusicVolume, writeMusicVolume } from "@/lib/musicStore";
import { newId } from "@/lib/library/model";
import { resolveStore } from "@/lib/library/useLibrary";
import Onboarding from "@/app/components/Onboarding";

type Stage = "form" | "making" | "player";

const EXAMPLES = [
  "I want to be calm and confident when I speak",
  "a healthy, strong body that I enjoy living in",
  "to run my own business doing work I love",
  "a loving, easy relationship with my family",
];

type Made = {
  lines: string[];
  url: string;
  voiceId: string;
  voiceName: string;
  source: string;
  /** 2–5 word title from the model, via X-Title. Absent for templates and fallbacks. */
  title?: string;
  starts?: number[];
  /** Programming mode (#77): the script alone, without the loop, for Save. */
  saveUrl?: string;
  saveLines?: string[];
  /** Programming mode: where the voice speaks, so the long session is not decoded again. */
  speech?: Segment[];
};

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
  // Programming mode (#77): minutes of repetition after the script, and the bell between them.
  const [repeatMin, setRepeatMin] = useState(0);
  const [bellOn, setBellOn] = useState(true);
  useEffect(() => {
    setRepeatMin(readRepeatMinutes());
    setBellOn(readBellOn());
  }, []);
  const [name, setName] = useState("");
  // Typing saves the draft, so a trip to Settings or a reload keeps it (#100).
  // Only edits save: a shared link fills the form without replacing the draft.
  const editWant = (v: string) => {
    setWant(v);
    writeDraft({ want: v, name });
  };
  const editName = (v: string) => {
    setName(v);
    writeDraft({ want, name: v });
  };
  const [variant, setVariant] = useState(0);
  // A recording made by the server for this wish. Null means the free
  // fallback: a template script read by the device's own voice.
  const [made, setMade] = useState<Made | null>(null);
  // The server's own script when only the voice failed: read by the device voice.
  const [fallback, setFallback] = useState<string[] | null>(null);
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
  // The voice the next recording will use: the chosen one, or with Mix voices on the next in the mix.
  const [nextVoice, setNextVoice] = useState(() => resolveVoice(DEFAULT_VOICE_ID));
  const [mixOn, setMixOn] = useState(false);
  // The voice of the recording being made now, for the "making" steps.
  const [makingVoice, setMakingVoice] = useState(() => resolveVoice(DEFAULT_VOICE_ID));
  const refreshNextVoice = useCallback(() => {
    ensureModeVoice();
    const chosen = resolveVoice(readVoiceChoice());
    const on = readMixOn();
    setStudioVoice(chosen);
    setMixOn(on);
    setNextVoice(on ? resolveVoice(peekMixVoice()) : chosen);
  }, []);
  useEffect(() => {
    refreshNextVoice();
  }, [refreshNextVoice]);
  const [canSpeak, setCanSpeak] = useState(true);
  const [music, setMusic] = useState(true);
  const [volume, setVolume] = useState(0.6);
  const [playing, setPlaying] = useState(false);
  const [idx, setIdx] = useState(-1);
  const [toast, setToast] = useState("");

  const token = useRef(0);
  const bed = useRef<MusicBed | null>(null);
  // Where the voice speaks in the current recording, so the music can dip under it.
  const speech = useRef<Segment[]>([]);
  useEffect(() => {
    setVolume(readMusicVolume());
    const choice = readMusicChoice();
    setMusic(choice !== "none");
    prefetchMusic(choice);
  }, []);

  // Without a server recording the device reads the script the server wrote,
  // when it sent one, else a general script. It never reads the typed wish back:
  // only the server's text model vets a wish.
  const lines = useMemo(() => made?.lines ?? fallback ?? neutralScript(name.trim()), [made, fallback, name]);
  const hue = useMemo(() => hashOf(want + variant) % 360, [want, variant]);
  // Voices, free counter, and shared links.
  useEffect(() => {
    setUsed(readCount());
    // A shared link only fills in the form; nothing plays until Create.
    // Otherwise restore what the listener typed before visiting Settings (#100).
    const d = startingDraft(window.location.search);
    setWant(d.want);
    setName(d.name);
    if (d.shared) setShared(true);
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
      bed.current?.stop();
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
      bed.current?.stop();
      bed.current = null;
    },
    [],
  );
  // A recording lives only in this tab. Free its memory when it is replaced.
  useEffect(
    () => () => {
      if (made) URL.revokeObjectURL(made.url);
      if (made?.saveUrl) URL.revokeObjectURL(made.saveUrl);
    },
    [made],
  );
  useEffect(() => {
    speech.current = [];
    if (!made) return;
    if (made.speech) {
      speech.current = made.speech;
      return;
    }
    let live = true;
    void fetch(made.url)
      .then((r) => r.blob())
      .then(speechOf)
      .then((s) => live && (speech.current = s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [made]);

  const stop = useCallback(() => {
    token.current++;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    audio.current?.pause();
    audio.current = null;
    bed.current?.stop();
    bed.current = null;
    setPlaying(false);
  }, []);

  // Must run inside the tap handler: mobile browsers only allow speech and
  // audio that start from a user gesture. All lines are queued at once.
  const play = useCallback(() => {
    stop();
    const mine = ++token.current;
    setPlaying(true);
    setIdx(0);
    if (music) {
      // Music on with "No music" chosen in Settings plays the default track.
      const choice = readMusicChoice();
      bed.current = new MusicBed();
      const md = readMode();
      void bed.current.start(choice === "none" ? DEFAULT_MUSIC : choice, volume, md.fadeInS, md.duck);
    }

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
      // Dip the music under each spoken stretch, on the audio clock.
      a.onplaying = () => {
        if (token.current !== mine) return;
        // iOS can leave the music's AudioContext suspended or interrupted once the voice starts (#52).
        bed.current?.resume();
        if (speech.current.length) bed.current?.duckFor(speech.current, a.currentTime);
        else bed.current?.holdDuck(true);
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
      u.onstart = () => {
        if (token.current !== mine) return;
        setIdx(i);
        bed.current?.holdDuck(true);
      };
      u.onend = () => token.current === mine && bed.current?.holdDuck(false);
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
  }, [canSpeak, lines, made, music, stop, voiceURI, volume]);

  // One request writes the script and records it. If recording is off, over
  // its limits or fails, the free fallback still gives the visitor something:
  // a template script in the device's own voice.
  const run = useRef(0);
  const generate = async (v: number) => {
    stop();
    const mine = ++run.current;
    setStage("making");
    setNote("");
    setIdx(-1);
    let next: Made | null = null;
    let written: string[] | null = null;
    // Repetition was asked for but could not be built: "voice" when the voice
    // cannot loop, "build" when this recording could not be cut into a loop.
    let noLoop: "" | "voice" | "build" = "";
    let why = "";
    let scriptReason: string | undefined;
    // Mix voices on: each new recording takes the next voice in the set.
    const mixing = readMixOn();
    const voice = mixing ? resolveVoice(peekMixVoice()) : studioVoice;
    setMakingVoice(voice);
    try {
      const res = await fetch("/api/manifest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          want: want.trim(),
          name: name.trim(),
          voiceId: voice.id,
          variant: v,
          pace: readPaceChoice(),
          tone: readToneChoice(),
          speedStep: readSpeedStepChoice(),
          cadenceStep: readCadenceStepChoice(),
          repeat: repeatMin > 0,
        }),
      });
      if (res.ok) {
        const packed = atob(res.headers.get("X-Script") ?? "");
        const made = JSON.parse(new TextDecoder().decode(Uint8Array.from(packed, (c) => c.charCodeAt(0))));
        if (!Array.isArray(made) || !made.every((l) => typeof l === "string")) throw new Error("bad script");
        const audio = await res.blob();
        const scriptSource = res.headers.get("X-Script-Source") ?? "";
        scriptReason = res.headers.get("X-Script-Reason") ?? undefined;
        const titleB64 = res.headers.get("X-Title");
        const serverTitle = titleB64 ? new TextDecoder().decode(Uint8Array.from(atob(titleB64), (c) => c.charCodeAt(0))) || undefined : undefined;
        const base = {
          voiceId: resolveVoice(res.headers.get("X-Voice-Id")).id,
          voiceName: resolveVoice(res.headers.get("X-Voice-Id")).name,
          source: scriptSource,
          ...(serverTitle ? { title: serverTitle } : {}),
        };
        // Programming mode: the server recorded the refrain after the script.
        const refrainB64 = res.headers.get("X-Refrain");
        const refrain = refrainB64 ? new TextDecoder().decode(Uint8Array.from(atob(refrainB64), (c) => c.charCodeAt(0))) : "";
        const allStarts = refrain ? readStarts(res.headers.get("X-Line-Starts"), made.length + 1) : undefined;
        const session =
          refrain && allStarts
            ? await composeSession({ audio, scriptLines: made, starts: allStarts, refrain, minutes: repeatMin, bellOn }).catch(() => null)
            : null;
        // "skipped": the voice can loop, but this take's refrain was left out.
        const skipped = res.headers.get("X-Repeat") === "skipped";
        noLoop = repeatMin > 0 && !session ? (refrain || skipped ? "build" : "voice") : "";
        // The loop could not be built from a recording that has the refrain at
        // its end: play and keep the script alone, without that last line.
        const plain =
          !session && refrain && allStarts ? await scriptOnly(audio, allStarts[made.length]).catch(() => null) : null;
        next = session
          ? { ...base, lines: session.lines, url: session.url, starts: session.starts, saveUrl: session.saveUrl, saveLines: made, speech: session.speech }
          : {
              ...base,
              lines: made,
              url: plain ?? URL.createObjectURL(audio),
              starts: plain && allStarts ? allStarts.slice(0, made.length).map((x) => x / allStarts[made.length]) : readStarts(res.headers.get("X-Line-Starts"), made.length),
            };
      } else {
        const j = (await res.json().catch(() => null)) as { error?: string; lines?: unknown } | null;
        why = j?.error ?? "Recording is not available just now.";
        written = scriptLines(j?.lines);
      }
    } catch {
      why = "The recording could not be made just now.";
    }
    if (run.current !== mine) {
      if (next) URL.revokeObjectURL(next.url);
      if (next?.saveUrl) URL.revokeObjectURL(next.saveUrl);
      return;
    }
    if (next && mixing) {
      advanceMix();
      refreshNextVoice();
    }
    setMade(next);
    setFallback(next ? null : written);
    setSavedId("");
    setNote(
      !next
        ? written
          ? `${why} Here is your script in your device's own voice.`
          : `${why} Here is a general version in your device's own voice.`
        : [
            next.source === "template" ? noteForReason(scriptReason) : "",
            noLoop === "voice"
              ? `${next.voiceName}'s recordings cannot be looped, so this plays without the repetition. Choose another voice in Settings to repeat it.`
              : noLoop === "build"
                ? "The repetition could not be built this time, so this plays the script alone."
                : "",
          ]
            .filter(Boolean)
            .join(" "),
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
      if (navigator.share) await navigator.share({ title: made?.title ?? displayTitle(toYouStatement(want)), url: u.toString() });
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
      const audio = made ? await (await fetch(made.saveUrl ?? made.url)).blob() : null;
      const now = Date.now();
      const id = newId();
      await (await resolveStore()).saveManifestation(
        {
          id,
          title: made?.source === "template" ? FALLBACK_TITLE : made ? (made.title ?? displayTitle(toYouStatement(want))) : FALLBACK_TITLE,
          want: want.trim(),
          firstName: name.trim(),
          lines: made?.saveLines ?? lines,
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
    setFallback(null);
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
            onChange={(e) => editWant(e.target.value)}
          />
          <div className="chips" aria-label="Examples">
            {EXAMPLES.map((e) => (
              <button key={e} type="button" className="chip" onClick={() => editWant(e)}>
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
                onChange={(e) => editName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="voice">Device voice, only if recording fails</label>
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
          <Link className="voicesummary" href="/settings#voice">
            <span className="small muted">Voice</span>
            <span>
              <b>{nextVoice.name}</b>
              <span className="small muted"> {mixOn ? "· next in your voice mix" : voiceBlurb(nextVoice) && `· ${voiceBlurb(nextVoice)}`}</span>
            </span>
            <span className="change">Change</span>
          </Link>
          <div className="row">
            <div>
              <label htmlFor="repeat">Repetition after the script</label>
              <select
                id="repeat"
                value={repeatMin}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setRepeatMin(n);
                  writeRepeatMinutes(n);
                }}
              >
                {REPEAT_MINUTES.map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? "Off" : `${m} min`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={bellOn}
                  disabled={repeatMin === 0}
                  onChange={(e) => {
                    setBellOn(e.target.checked);
                    writeBellOn(e.target.checked);
                  }}
                />{" "}
                A soft bell between repetitions
              </label>
            </div>
          </div>
          {repeatMin > 0 && (
            <p className="small muted">
              After the script, a short phrase from it repeats for {repeatMin} min, then it closes. Repetition helps the
              new idea settle in, especially at first.
            </p>
          )}
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
        <p className="lede">This takes up to half a minute. Keep this page open.</p>
      </>
    );
  }

  const current = idx >= 0 && idx < lines.length ? lines[idx] : null;

  return (
    <>
      <h1>{made?.source === "template" ? FALLBACK_TITLE : (made?.title ?? displayTitle(toYouStatement(want)))}</h1>
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
          {current ?? (idx >= lines.length ? CLOSING : "")}
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
        {music && (
          <label className="small muted volume">
            <span className="sr-only">Music volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              aria-label="Music volume"
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                writeMusicVolume(v);
                bed.current?.setVolume(v);
              }}
            />
          </label>
        )}
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
          ? `Recorded in the voice of ${made.voiceName}. ${savedId ? "Saved in your library." : "Not kept unless you tap Save."}`
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
  return (
    <div className="gate">
      <h3>Keep this, in a voice you choose</h3>
      <p className="muted">
        A free account saves your manifestations and plays them back to back, on any device. A
        subscription adds studio voices, daily variations, images and music.
      </p>
      <Link className="btn primary" href="/account">
        Create a free account
      </Link>
    </div>
  );
}
