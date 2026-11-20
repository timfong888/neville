"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { lineStarts } from "@/lib/audio";
import type { Manifestation } from "@/lib/library/model";
import { getStore } from "@/lib/library/useLibrary";
import { DEFAULT_MUSIC, type Segment } from "@/lib/music";
import { MusicBed, prefetchMusic, speechOf } from "@/lib/musicBed";
import { readMusicChoice, readMusicVolume, writeMusicVolume } from "@/lib/musicStore";
import { backPos, DEFAULT_GAP_MS, nextPos, playOrder, REPEATS, skipPos, silenceWav, type Repeat } from "@/lib/playback";
import { hashOf } from "@/lib/script";

const REPEAT_LABEL: Record<Repeat, string> = { off: "Repeat: off", all: "Repeat: all", one: "Repeat: one" };

type Phase = "idle" | "playing" | "paused";

/**
 * Plays a list of manifestations one after another, with silence between them.
 *
 * One <audio> element carries the whole session: each recording, then a short
 * silent file for the gap, then the next recording. Nothing waits on a timer
 * between tracks, so it keeps going with the screen locked, and the lock screen
 * shows the track and its controls (Media Session). A manifestation without a
 * recording is read by the device's own voice; that part needs the screen on.
 */
export default function PlaylistPlayer({
  items,
  title = "Neville",
  gapMs = DEFAULT_GAP_MS,
}: {
  items: Manifestation[];
  /** Shown as the album on the lock screen. */
  title?: string;
  gapMs?: number;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [cur, setCur] = useState(-1);
  const [idx, setIdx] = useState(-1);
  const [music, setMusic] = useState(true);
  const [volume, setVolume] = useState(0.6);
  const [repeat, setRepeat] = useState<Repeat>("off");
  const [shuffle, setShuffle] = useState(false);
  const [done, setDone] = useState(false);
  const [note, setNote] = useState("");

  const token = useRef(0);
  const el = useRef<HTMLAudioElement | null>(null);
  const bed = useRef<MusicBed | null>(null);
  const speech = useRef<Record<string, Segment[]>>({});
  const order = useRef<number[]>([]);
  const pos = useRef(0);
  const gapUrl = useRef("");
  // Timer callbacks (read-along steps, the gap fallback). Pause stops each with its remaining
  // time; Resume starts it again with that time, so nothing runs early or all at once.
  type Pending = { fn: () => void; due: number; left: number; handle: ReturnType<typeof setTimeout> | null };
  const timers = useRef(new Map<number, Pending>());
  const timerId = useRef(0);
  const arm = (id: number, t: Pending, ms: number) => {
    t.due = Date.now() + ms;
    t.handle = setTimeout(() => {
      timers.current.delete(id);
      t.fn();
    }, ms);
  };
  const later = (fn: () => void, ms: number) => {
    const id = ++timerId.current;
    const t: Pending = { fn, due: 0, left: ms, handle: null };
    timers.current.set(id, t);
    if (!paused.current) arm(id, t, ms);
  };
  const clearTimers = () => {
    timers.current.forEach((t) => t.handle && clearTimeout(t.handle));
    timers.current.clear();
  };
  const paused = useRef(false);
  const pausedAt = useRef(0);
  // The items and recordings of the session that is playing, fixed at Play, so editing the
  // playlist mid-session cannot shift which track comes next.
  const session = useRef<{ items: Manifestation[]; urls: Record<string, string> }>({ items: [], urls: {} });
  const active = useRef(false);
  // Blob URLs replaced while a session still uses them; freed when the session ends.
  const stale = useRef<string[]>([]);
  // True from setting the element's src until it plays, so a pause that comes with a src change is not taken for a system pause.
  const switching = useRef(false);
  // True while the current track (or its gap) plays through the <audio> element; false during the
  // device voice. Resume only restarts the element when it is in use, so an old recording left
  // paused on it cannot start again under the device voice.
  const usesElement = useRef(false);
  // For Previous: when the current track started (moved forward by pauses), and whether the gap after it is playing.
  const trackStart = useRef(0);
  const inGap = useRef(false);
  // The latest settings, for callbacks made before they changed.
  const live = useRef({ repeat, gapMs, items, urls });
  live.current = { repeat, gapMs, items, urls };

  useEffect(() => {
    setVolume(readMusicVolume());
    const choice = readMusicChoice();
    setMusic(choice !== "none");
    prefetchMusic(choice);
  }, []);

  // The silent file played between tracks.
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([silenceWav(gapMs)], { type: "audio/wav" }));
    gapUrl.current = u;
    return () => URL.revokeObjectURL(u);
  }, [gapMs]);

  // Load every recording before Play is offered, so playback starts inside the tap.
  const key = items.map((m) => `${m.id}:${m.updatedAt}`).join(",");
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    setLoading(true);
    void Promise.all(
      items.map(async (m) => {
        if (!m.hasAudio) return null;
        const b = await getStore().getAudio(m.id);
        if (!b) return null;
        const u = URL.createObjectURL(b);
        made.push(u);
        void speechOf(b).then((s) => alive && (speech.current[m.id] = s));
        return [m.id, u] as const;
      }),
    ).then((pairs) => {
      if (!alive) return;
      setUrls(Object.fromEntries(pairs.filter((p): p is readonly [string, string] => !!p)));
      setLoading(false);
    });
    return () => {
      alive = false;
      if (active.current) stale.current.push(...made);
      else made.forEach((u) => URL.revokeObjectURL(u));
    };
    // `key` stands for `items`: same ids and versions, same recordings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  /** Stops whatever the current track is doing, without ending the session. */
  const cancelTrack = () => {
    token.current++;
    clearTimers();
    paused.current = false;
    inGap.current = false;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      // cancel() keeps a paused engine paused, and new lines would never start.
      window.speechSynthesis.resume();
    }
    const a = el.current;
    if (a) a.onended = a.ontimeupdate = a.onerror = a.onplaying = null;
    return token.current;
  };

  const halt = useCallback(() => {
    cancelTrack();
    active.current = false;
    el.current?.pause();
    bed.current?.stop();
    bed.current = null;
    stale.current.forEach((u) => URL.revokeObjectURL(u));
    stale.current = [];
    setPhase("idle");
    setCur(-1);
    setIdx(-1);
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "none";
      navigator.mediaSession.metadata = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => halt(), [halt]);

  const finish = () => {
    halt();
    setCur(-1);
    setIdx(-1);
    setDone(true);
  };

  const showOnLockScreen = (m: Manifestation) => {
    if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: m.title,
      artist: m.hasAudio && session.current.urls[m.id] ? `Neville · ${m.voiceName}` : "Neville",
      album: title,
      artwork: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    });
    navigator.mediaSession.playbackState = "playing";
  };

  /** After a track: the gap's silence, then whatever comes next. */
  const afterTrack = (mine: number) => {
    if (token.current !== mine) return;
    bed.current?.holdDuck(false);
    const n = nextPos(pos.current, order.current.length, live.current.repeat);
    if (n < 0) return finish();
    const a = el.current!;
    setIdx(-1);
    // The finished recording's handlers must not run over the gap.
    a.ontimeupdate = a.onplaying = null;
    let started = false;
    const go = () => {
      if (started || token.current !== mine) return;
      started = true;
      startAt(n, mine);
    };
    a.onended = go;
    a.onerror = go;
    inGap.current = true;
    usesElement.current = true;
    switching.current = true;
    a.src = gapUrl.current;
    void a.play().catch(() => {
      // A pause during the switch rejects play(); Resume plays the gap again.
      if (token.current !== mine || paused.current) return;
      later(go, live.current.gapMs);
    });
  };

  const readAlong = (m: Manifestation, from: number, mine: number) => {
    const dur = (l: string) => 1200 + l.length * 70;
    let at = 0;
    m.lines.slice(from).forEach((l, i) => {
      later(() => token.current === mine && setIdx(from + i), at);
      at += dur(l);
    });
    later(() => afterTrack(mine), at);
  };

  const speak = (m: Manifestation, mine: number) => {
    if (!("speechSynthesis" in window) || !m.lines.length) return readAlong(m, 0, mine);
    const synth = window.speechSynthesis;
    let failed = false;
    m.lines.forEach((text, i) => {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.82;
      u.pitch = 0.95;
      u.onstart = () => {
        if (token.current !== mine) return;
        setIdx(i);
        bed.current?.holdDuck(true);
      };
      u.onend = () => {
        if (token.current !== mine) return;
        bed.current?.holdDuck(false);
        if (i === m.lines.length - 1 && !failed) afterTrack(mine);
      };
      u.onerror = (e) => {
        if (failed || token.current !== mine || e.error === "canceled" || e.error === "interrupted") return;
        failed = true;
        synth.cancel();
        readAlong(m, i, mine);
      };
      synth.speak(u);
    });
  };

  /** Plays the track at position `p` of the play order. */
  const startAt = (p: number, mine: number) => {
    if (token.current !== mine) return;
    const { items: list, urls: u } = session.current;
    pos.current = p;
    inGap.current = false;
    trackStart.current = Date.now();
    const i = order.current[p];
    const m = list[i];
    if (!m) return finish();
    setCur(i);
    setIdx(0);
    showOnLockScreen(m);
    const url = u[m.id];
    if (!url) {
      usesElement.current = false;
      return speak(m, mine);
    }
    usesElement.current = true;

    const a = el.current!;
    const starts = lineStarts(m.lines);
    switching.current = true;
    a.src = url;
    a.ontimeupdate = () => {
      if (token.current !== mine || !a.duration) return;
      const at = a.currentTime / a.duration;
      let k = 0;
      while (k + 1 < starts.length && starts[k + 1] <= at) k++;
      setIdx(k);
    };
    a.onplaying = () => {
      if (token.current !== mine) return;
      const segs = speech.current[m.id];
      if (segs?.length) bed.current?.duckFor(segs, a.currentTime);
      else bed.current?.holdDuck(true);
    };
    a.onended = () => afterTrack(mine);
    // The error event and the play() rejection can both report one failure: fall back once.
    let fellBack = false;
    const fallBack = (why?: string) => {
      if (fellBack || token.current !== mine) return;
      fellBack = true;
      a.onerror = a.onended = a.onplaying = a.ontimeupdate = null;
      usesElement.current = false;
      if (why) setNote(why);
      speak(m, mine);
    };
    a.onerror = () => fallBack(`The recording of “${m.title}” could not be played, so your device read it.`);
    void a.play().catch((err: unknown) => {
      if (fellBack || token.current !== mine || paused.current || a.src !== url) return;
      // AbortError without a Pause from us: the system interrupted (a call, Siri). Show it as paused.
      if ((err as { name?: string })?.name === "AbortError") return pauseRef.current();
      fallBack();
    });
  };

  /** Moves to another position without restarting the music. */
  const jump = (p: number) => {
    if (p < 0) return finish();
    const mine = cancelTrack();
    // A device-voice track does not touch the element, so stop the recording that was playing.
    // Marked as a switch so the pause listener does not take it for a system pause.
    switching.current = true;
    el.current?.pause();
    setPhase("playing");
    bed.current?.resume();
    startAt(p, mine);
  };

  // Must run inside the tap handler.
  const play = (from = 0) => {
    if (!items.length) return;
    halt();
    const mine = ++token.current;
    setDone(false);
    setNote("");
    setPhase("playing");
    if (!el.current) {
      const a = new Audio();
      a.addEventListener("playing", () => (switching.current = false));
      a.addEventListener("error", () => (switching.current = false));
      // A pause the app did not ask for (a call, Siri, headphones out): show it as paused so Play works.
      a.addEventListener("pause", () => {
        if (!active.current || paused.current || switching.current || a.ended) return;
        pauseRef.current();
      });
      el.current = a;
    }
    session.current = { items, urls };
    active.current = true;
    // Unlock the element inside the tap even if the first track uses the device voice.
    switching.current = true;
    el.current.src = gapUrl.current;
    void el.current.play().catch(() => {});
    if (music) {
      const choice = readMusicChoice();
      bed.current = new MusicBed();
      void bed.current.start(choice === "none" ? DEFAULT_MUSIC : choice, volume);
    }
    order.current = playOrder(items.length, shuffle, from);
    startAt(shuffle ? 0 : from, mine);
  };

  const pause = () => {
    if (!active.current || paused.current) return;
    paused.current = true;
    pausedAt.current = Date.now();
    timers.current.forEach((t) => {
      if (t.handle) clearTimeout(t.handle);
      t.handle = null;
      t.left = Math.max(0, t.due - Date.now());
    });
    el.current?.pause();
    if ("speechSynthesis" in window && window.speechSynthesis.speaking) window.speechSynthesis.pause();
    bed.current?.pause();
    setPhase("paused");
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
  };

  const resume = () => {
    if (!paused.current) {
      // Playing by our state but the system stopped the element: just start it again.
      if (active.current && usesElement.current && el.current?.paused && !el.current.ended) void el.current.play().catch(() => {});
      return;
    }
    paused.current = false;
    trackStart.current += Date.now() - pausedAt.current;
    bed.current?.resume();
    if ("speechSynthesis" in window) window.speechSynthesis.resume();
    if (usesElement.current && el.current?.paused && !el.current.ended) void el.current.play().catch(() => {});
    setPhase("playing");
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    timers.current.forEach((t, id) => arm(id, t, t.left));
  };

  const pauseRef = useRef(pause);
  pauseRef.current = pause;

  const next = () => jump(skipPos(pos.current, order.current.length, repeat));
  // In the gap after a track, Previous replays that track; otherwise it restarts or goes back by time into the track.
  const prev = () =>
    jump(
      inGap.current
        ? pos.current
        : backPos(
            pos.current,
            order.current.length,
            // Time into the track, not counting a pause still under way.
            ((paused.current ? pausedAt.current : Date.now()) - trackStart.current) / 1000,
            repeat,
          ),
    );

  // Lock-screen and headphone controls. Re-bound each render so they see current state.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (action: MediaSessionAction, fn: (() => void) | null) => {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        /* action not supported here */
      }
    };
    const active = phase !== "idle";
    set("play", active ? resume : () => play(0));
    set("pause", active ? pause : null);
    // A single manifestation has no next or previous track.
    set("nexttrack", active && items.length > 1 ? next : null);
    set("previoustrack", active && items.length > 1 ? prev : null);
    set("stop", active ? halt : null);
  });
  useEffect(
    () => () => {
      if (!("mediaSession" in navigator)) return;
      for (const a of ["play", "pause", "nexttrack", "previoustrack", "stop"] as MediaSessionAction[]) {
        try {
          navigator.mediaSession.setActionHandler(a, null);
        } catch {
          /* not supported */
        }
      }
      navigator.mediaSession.metadata = null;
    },
    [],
  );

  const playing = phase !== "idle";
  // While a session plays, show what it plays (the snapshot taken at Play), not the edited list.
  const shown = phase !== "idle" ? session.current.items : items;
  const m = cur >= 0 ? shown[cur] ?? null : null;
  const line = m && idx >= 0 && idx < m.lines.length ? m.lines[idx] : null;
  const hue = hashOf(m?.want ?? items[0]?.want ?? "neville") % 360;
  const multi = items.length > 1;

  if (!items.length) return <p className="muted">Nothing to play yet.</p>;

  return (
    <>
      <div
        className={`visual${phase === "playing" ? " playing" : ""}`}
        style={{ "--h1": hue, "--h2": (hue + 60) % 360, "--h3": (hue + 300) % 360 } as React.CSSProperties}
      >
        <div className="blob" />
        <div className="line" aria-live="polite">
          {line ?? (done ? "And so it is." : "")}
        </div>
      </div>
      <p className="small muted" aria-live="polite">
        {m
          ? `${phase === "paused" ? "Paused" : "Now playing"} ${pos.current + 1} of ${shown.length}: ${m.title}`
          : done
            ? "Finished."
            : multi
              ? `${items.length} to play, one after another.`
              : ""}
      </p>
      <div className="controls">
        {!playing ? (
          <button className="btn primary" onClick={() => play(0)} disabled={loading}>
            {loading ? "Loading…" : done ? "▶ Play again" : multi ? "▶ Play all" : "▶ Play"}
          </button>
        ) : phase === "paused" ? (
          <button className="btn primary" onClick={resume}>
            ▶ Resume
          </button>
        ) : (
          <button className="btn primary" onClick={pause}>
            ❚❚ Pause
          </button>
        )}
        {playing && (
          <button className="btn sm" onClick={halt}>
            ■ Stop
          </button>
        )}
        {multi && (
          <>
            <button className="btn sm" disabled={!playing} onClick={prev}>
              ⏮ Previous
            </button>
            <button className="btn sm" disabled={!playing} onClick={next}>
              Next ⏭
            </button>
          </>
        )}
      </div>
      <div className="controls">
        <button
          className="btn sm ghost"
          aria-pressed={repeat !== "off"}
          onClick={() => setRepeat((r) => REPEATS[(REPEATS.indexOf(r) + 1) % REPEATS.length])}
        >
          {REPEAT_LABEL[repeat]}
        </button>
        {multi && (
          <button
            className="btn sm ghost"
            aria-pressed={shuffle}
            onClick={() => {
              setShuffle((v) => !v);
              // Takes effect from the next Play; the current order keeps going.
            }}
          >
            Shuffle: {shuffle ? "on" : "off"}
          </button>
        )}
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
        {music && (
          <label className="small muted volume">
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
      {note && <p className="small muted">{note}</p>}
      {multi && (
        <ol className="script">
          {items.map((it, i) => (
            <li key={it.id} className={m && it.id === m.id ? "now" : ""}>
              <button className="linkish" disabled={loading} onClick={() => play(i)} aria-label={`Play from ${it.title}`}>
                {it.title}
              </button>
              <span className="small muted"> · {it.hasAudio && urls[it.id] ? it.voiceName : "device voice"}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
