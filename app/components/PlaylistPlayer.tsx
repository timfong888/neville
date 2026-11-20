"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { lineStarts, startPad } from "@/lib/audio";
import type { Manifestation } from "@/lib/library/model";
import { resolveStore } from "@/lib/library/useLibrary";
import { hashOf } from "@/lib/script";

/** Silence between two manifestations. */
const GAP_MS = 2500;

/**
 * Plays a list of manifestations from first to last. Recordings play from the
 * store; one without a recording is read by the device's own voice, or shown
 * line by line when the browser has no speech.
 */
export default function PlaylistPlayer({ items }: { items: Manifestation[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(-1);
  const [idx, setIdx] = useState(-1);
  const [music, setMusic] = useState(true);
  const [done, setDone] = useState(false);
  const [note, setNote] = useState("");

  const token = useRef(0);
  const el = useRef<HTMLAudioElement | null>(null);
  const stopPad = useRef<(() => void) | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  // Load every recording before Play is offered, so playback starts inside the tap.
  const key = items.map((m) => `${m.id}:${m.updatedAt}`).join(",");
  useEffect(() => {
    let live = true;
    const made: string[] = [];
    setLoading(true);
    void Promise.all(
      items.map(async (m) => {
        if (!m.hasAudio) return null;
        const b = await (await resolveStore()).getAudio(m.id);
        if (!b) return null;
        const u = URL.createObjectURL(b);
        made.push(u);
        return [m.id, u] as const;
      }),
    ).then((pairs) => {
      if (!live) return;
      setUrls(Object.fromEntries(pairs.filter((p): p is readonly [string, string] => !!p)));
      setLoading(false);
    });
    return () => {
      live = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
    // `key` stands for `items`: same ids and versions, same recordings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const halt = useCallback(() => {
    token.current++;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (el.current) {
      el.current.onended = el.current.ontimeupdate = el.current.onerror = null;
      el.current.pause();
    }
    stopPad.current?.();
    stopPad.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => () => halt(), [halt]);

  const readAlong = (m: Manifestation, from: number, mine: number, next: () => void) => {
    const dur = (l: string) => 1200 + l.length * 70;
    let at = 0;
    m.lines.slice(from).forEach((l, i) => {
      later(() => token.current === mine && setIdx(from + i), at);
      at += dur(l);
    });
    later(next, at);
  };

  const speak = (m: Manifestation, mine: number, next: () => void) => {
    if (!("speechSynthesis" in window) || !m.lines.length) return readAlong(m, 0, mine, next);
    const synth = window.speechSynthesis;
    let failed = false;
    m.lines.forEach((text, i) => {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.82;
      u.pitch = 0.95;
      u.onstart = () => token.current === mine && setIdx(i);
      u.onerror = (e) => {
        if (failed || token.current !== mine || e.error === "canceled" || e.error === "interrupted") return;
        failed = true;
        synth.cancel();
        readAlong(m, i, mine, next);
      };
      if (i === m.lines.length - 1) u.onend = () => !failed && next();
      synth.speak(u);
    });
  };

  const runItem = (i: number, mine: number) => {
    if (token.current !== mine) return;
    if (i >= items.length) {
      halt();
      setCur(-1);
      setIdx(-1);
      setDone(true);
      return;
    }
    setCur(i);
    setIdx(0);
    const m = items[i];
    const next = () => token.current === mine && later(() => runItem(i + 1, mine), GAP_MS);
    const url = urls[m.id];
    if (!url) return speak(m, mine, next);

    // One audio element for the whole playlist: once a tap has started it,
    // browsers let it carry on to the next file without another tap.
    const a = el.current ?? (el.current = new Audio());
    const starts = lineStarts(m.lines);
    a.src = url;
    a.ontimeupdate = () => {
      if (token.current !== mine || !a.duration) return;
      const at = a.currentTime / a.duration;
      let k = 0;
      while (k + 1 < starts.length && starts[k + 1] <= at) k++;
      setIdx(k);
    };
    a.onended = next;
    a.onerror = () => {
      if (token.current !== mine) return;
      a.onerror = a.onended = null;
      setNote(`The recording of “${m.title}” could not be played, so your device read it.`);
      speak(m, mine, next);
    };
    void a.play().catch(() => {
      if (token.current !== mine) return;
      a.onerror = a.onended = null;
      speak(m, mine, next);
    });
  };

  // Must run inside the tap handler.
  const play = (from = 0) => {
    if (!items.length) return;
    halt();
    const mine = ++token.current;
    setDone(false);
    setNote("");
    setPlaying(true);
    if (!el.current) el.current = new Audio();
    if (music) stopPad.current = startPad();
    runItem(from, mine);
  };

  const m = cur >= 0 ? items[cur] : null;
  const line = m && idx >= 0 && idx < m.lines.length ? m.lines[idx] : null;
  const hue = hashOf(m?.want ?? items[0]?.want ?? "neville") % 360;

  if (!items.length) return <p className="muted">Nothing to play yet.</p>;

  return (
    <>
      <div
        className={`visual${playing ? " playing" : ""}`}
        style={{ "--h1": hue, "--h2": (hue + 60) % 360, "--h3": (hue + 300) % 360 } as React.CSSProperties}
      >
        <div className="blob" />
        <div className="line" aria-live="polite">
          {line ?? (done ? "And so it is." : "")}
        </div>
      </div>
      <p className="small muted" aria-live="polite">
        {m ? `Now playing ${cur + 1} of ${items.length}: ${m.title}` : done ? "Finished." : `${items.length} to play, one after another.`}
      </p>
      <div className="controls">
        {playing ? (
          <button className="btn primary" onClick={halt}>
            ■ Stop
          </button>
        ) : (
          <button className="btn primary" onClick={() => play(0)} disabled={loading}>
            {loading ? "Loading…" : done ? "▶ Play again" : "▶ Play all"}
          </button>
        )}
        <button className="btn sm" disabled={!playing || cur <= 0} onClick={() => play(cur - 1)}>
          ⏮ Previous
        </button>
        <button className="btn sm" disabled={!playing || cur >= items.length - 1} onClick={() => play(cur + 1)}>
          Next ⏭
        </button>
        <button
          className="btn sm ghost"
          aria-pressed={music}
          onClick={() => {
            setMusic((v) => !v);
            if (playing) halt();
          }}
        >
          Music: {music ? "on" : "off"}
        </button>
      </div>
      {note && <p className="small muted">{note}</p>}
      <ol className="script">
        {items.map((it, i) => (
          <li key={it.id} className={i === cur ? "now" : ""}>
            <button className="linkish" disabled={loading} onClick={() => play(i)} aria-label={`Play from ${it.title}`}>
              {it.title}
            </button>
            <span className="small muted"> · {it.hasAudio && urls[it.id] ? it.voiceName : "device voice"}</span>
          </li>
        ))}
      </ol>
    </>
  );
}
