"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_VOICE_ID, ENABLED_VOICES, resolveVoice, voiceBlurb } from "@/lib/voices";
import { writeVoiceChoice } from "@/lib/voiceStore";
import { paceSupport } from "@/lib/voiceMix";
import { readMix, writeMixOn } from "@/lib/voiceMixStore";

/** Voices that new recordings can use. Sample-only voices stay in Settings. */
const RECORDABLE = ENABLED_VOICES.filter((v) => v.generate);
const PACE_NOTE = { honours: "", ignores: "Ignores pace", untested: "Pace untested" } as const;
/** A preview is the first few seconds of the voice's pre-made sample: free, no recording. */
const PREVIEW_MS = 5000;

type Props = {
  /** The single voice chosen now (also the default when Mix is off). */
  chosenId: string;
  mixOn: boolean;
  /** Name of the voice the next recording will use. */
  nextName: string;
  /** Called after the choice is saved, so the page re-reads it. */
  onChange: () => void;
};

/**
 * The voice picker on the create page: one voice or Mix voices, each with a
 * short description and a few seconds of preview. The choice is the same one
 * Settings keeps, so it becomes the default for later recordings too.
 */
export default function VoiceChooser({ chosenId, mixOn, nextName, onChange }: Props) {
  const [playing, setPlaying] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [mixNames, setMixNames] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMixNames(readMix().map((id) => resolveVoice(id).name).join(", "));
  }, [mixOn]);

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    audio.current?.pause();
    audio.current = null;
    setPlaying(null);
  }, []);
  useEffect(() => stop, [stop]);

  const preview = (id: string, src: string) => {
    if (playing === id) return stop();
    stop();
    const a = new Audio(src);
    audio.current = a;
    const done = () => audio.current === a && stop();
    a.onended = done;
    a.onerror = () => {
      if (audio.current !== a) return;
      stop();
      setNote("That preview could not be played.");
    };
    setPlaying(id);
    setNote("");
    void a
      .play()
      .then(() => {
        if (audio.current === a) timer.current = setTimeout(done, PREVIEW_MS);
      })
      .catch(done);
  };

  const chooseVoice = (id: string) => {
    const savedVoice = writeVoiceChoice(id);
    const savedMix = writeMixOn(false);
    const name = resolveVoice(id).name;
    setNote(
      savedVoice && savedMix
        ? `${name} will record your manifestations from now on.`
        : `${name} is chosen for now. This browser would not save it, so it resets when you leave.`,
    );
    onChange();
  };

  const chooseMix = () => {
    setNote(writeMixOn(true) ? "Mix voices is on: each new recording takes the next voice." : "Mix voices is on for now; this browser would not save it.");
    onChange();
  };

  const summary = mixOn ? `Mix voices · next: ${nextName}` : nextName;

  return (
    <details className="voicechooser">
      <summary>
        <span className="small muted">Voice</span>
        <b>{summary}</b>
        <span className="change">Change</span>
      </summary>
      <fieldset className="voicelist">
        <legend className="small muted">Choose the voice for this and later recordings. Previews are free.</legend>
        <div className={`voicerow${mixOn ? " on" : ""}`}>
          <label>
            <input type="radio" name="create-voice" checked={mixOn} onChange={chooseMix} />
            <span className="vname">Mix voices</span>
            <span className="small muted">
              Each new recording takes the next voice{mixNames ? `: ${mixNames}` : ""}. Edit the set in{" "}
              <Link href="/settings">Settings</Link>.
            </span>
          </label>
        </div>
        {RECORDABLE.map((v) => {
          const pace = PACE_NOTE[paceSupport(v)];
          return (
            <div key={v.id} className={`voicerow${!mixOn && chosenId === v.id ? " on" : ""}`}>
              <label>
                <input
                  type="radio"
                  name="create-voice"
                  value={v.id}
                  checked={!mixOn && chosenId === v.id}
                  onChange={() => chooseVoice(v.id)}
                />
                <span className="vname">
                  {v.name}
                  {v.id === DEFAULT_VOICE_ID && <span className="pill">Default</span>}
                </span>
                <span className="small muted">{[voiceBlurb(v), pace].filter(Boolean).join(" · ")}</span>
              </label>
              <button
                type="button"
                className="btn sm ghost"
                aria-label={`${playing === v.id ? "Stop" : "Preview"} ${v.name}`}
                onClick={() => preview(v.id, v.sample)}
              >
                {playing === v.id ? "Stop" : "▶ 5s"}
              </button>
            </div>
          );
        })}
      </fieldset>
      <p className="toast" role="status">
        {note}
      </p>
    </details>
  );
}
