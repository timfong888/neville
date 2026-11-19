"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_PACE_ID,
  DEFAULT_TONE_ID,
  PACES,
  TONES,
  type PaceId,
  type ToneId,
} from "@/lib/delivery";
import { readPaceChoice, readToneChoice, writePaceChoice, writeToneChoice } from "@/lib/deliveryStore";

export default function DeliveryPicker() {
  const [pace, setPace] = useState<PaceId>(DEFAULT_PACE_ID);
  const [tone, setTone] = useState<ToneId>(DEFAULT_TONE_ID);
  const [note, setNote] = useState("");

  // Stored choices are read after the page loads.
  useEffect(() => {
    setPace(readPaceChoice());
    setTone(readToneChoice());
  }, []);

  const saved = (ok: boolean, what: string) =>
    setNote(
      ok
        ? `Saved. ${what} on this device.`
        : `${what} for now. This browser would not save it, so it resets when you leave.`,
    );

  return (
    <>
      <fieldset className="voicelist">
        <legend className="small muted">Pace</legend>
        {PACES.map((p) => (
          <div key={p.id} className={`voicerow${pace === p.id ? " on" : ""}`}>
            <label>
              <input
                type="radio"
                name="pace"
                value={p.id}
                checked={pace === p.id}
                onChange={() => {
                  setPace(p.id);
                  saved(writePaceChoice(p.id), `${p.label} pace is set`);
                }}
              />
              <span className="vname">
                {p.label}
                {p.id === DEFAULT_PACE_ID && <span className="pill">Default</span>}
              </span>
              <span className="small muted">{p.note}</span>
            </label>
          </div>
        ))}
      </fieldset>
      <fieldset className="voicelist">
        <legend className="small muted">Tone</legend>
        {TONES.map((t) => (
          <div key={t.id} className={`voicerow${tone === t.id ? " on" : ""}`}>
            <label>
              <input
                type="radio"
                name="tone"
                value={t.id}
                checked={tone === t.id}
                onChange={() => {
                  setTone(t.id);
                  saved(writeToneChoice(t.id), `${t.label} tone is set`);
                }}
              />
              <span className="vname">
                {t.label}
                {t.id === DEFAULT_TONE_ID && <span className="pill">Default</span>}
              </span>
              <span className="small muted">{t.note}</span>
            </label>
          </div>
        ))}
      </fieldset>
      <p className="toast" role="status">
        {note}
      </p>
      <p className="small muted">
        Pace and tone shape the next recording: how the script is written, how slowly it is read
        and how long the pauses are. Voices differ in how much they follow; the pauses between
        lines apply to every voice that can be stitched.
      </p>
    </>
  );
}
