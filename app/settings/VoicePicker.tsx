"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_VOICE_ID,
  ENABLED_VOICES,
  TIER_LABEL,
  resolveVoice,
  voiceBlurb,
} from "@/lib/voices";
import { readVoiceChoice, writeVoiceChoice } from "@/lib/voiceStore";
import { paceSupport } from "@/lib/voiceMix";

const PACE_LABEL = { honours: "", ignores: "Ignores pace", untested: "Pace untested" } as const;

export default function VoicePicker() {
  const [chosen, setChosen] = useState(DEFAULT_VOICE_ID);
  const [playing, setPlaying] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);

  // The stored choice is read after the page loads; an id that is no longer
  // offered falls back to the default.
  useEffect(() => {
    setChosen(resolveVoice(readVoiceChoice()).id);
  }, []);

  const stop = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    setPlaying(null);
  }, []);

  useEffect(() => stop, [stop]);

  const toggle = (id: string, src: string) => {
    if (playing === id) return stop();
    stop();
    const a = new Audio(src);
    audio.current = a;
    a.onended = () => audio.current === a && stop();
    a.onerror = () => {
      if (audio.current !== a) return;
      stop();
      setNote("That sample could not be played.");
    };
    setPlaying(id);
    setNote("");
    void a.play().catch(() => audio.current === a && stop());
  };

  const choose = (id: string) => {
    setChosen(id);
    const name = resolveVoice(id).name;
    setNote(
      writeVoiceChoice(id)
        ? `Saved. ${name} is your voice on this device.`
        : `${name} is chosen for now. This browser would not save it, so it resets when you leave.`,
    );
  };

  return (
    <>
      <fieldset className="voicelist">
        <legend className="small muted">
          {ENABLED_VOICES.length} voices. Samples are pre-made, so listening is free.
        </legend>
        {ENABLED_VOICES.map((v) => (
          <div key={v.id} className={`voicerow${chosen === v.id ? " on" : ""}`}>
            <label>
              <input
                type="radio"
                name="voice"
                value={v.id}
                checked={chosen === v.id}
                disabled={!v.generate}
                onChange={() => choose(v.id)}
              />
              <span className="vname">
                {v.name}
                {v.id === DEFAULT_VOICE_ID && <span className="pill">Default</span>}
              </span>
              <span className="small muted">
                {[v.generate ? "" : "Sample only", voiceBlurb(v), v.provider, TIER_LABEL[v.tier], v.generate ? PACE_LABEL[paceSupport(v)] : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </label>
            <button
              type="button"
              className="btn sm ghost"
              aria-label={`${playing === v.id ? "Stop" : "Play"} sample of ${v.name}`}
              onClick={() => toggle(v.id, v.sample)}
            >
              {playing === v.id ? "Stop" : "Play"}
            </button>
          </div>
        ))}
      </fieldset>
      <p className="toast" role="status">
        {note}
      </p>
      <p className="small muted">
        Your choice is kept on this device only. No account is needed.{" "}
        New manifestations are recorded in the voice you choose. Voices marked sample only can be
        heard here but not chosen yet.
      </p>
    </>
  );
}
