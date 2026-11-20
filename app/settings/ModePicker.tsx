"use client";

import { useEffect, useState } from "react";
import { DEFAULT_MODE_ID, MODES, type ModeId } from "@/lib/modes";
import { applyMode, readMode } from "@/lib/modeStore";

/** Sleep, Calm or Active: one tap sets pace, tone, music and pauses. The pickers below can still change any of them. */
export default function ModePicker({ onApplied }: { onApplied?: () => void }) {
  const [mode, setMode] = useState<ModeId>(DEFAULT_MODE_ID);
  const [note, setNote] = useState("");
  useEffect(() => setMode(readMode().id), []);

  return (
    <>
      <fieldset className="voicelist">
        <legend className="small muted">Mode</legend>
        {MODES.map((m) => (
          <div key={m.id} className={`voicerow${mode === m.id ? " on" : ""}`}>
            <label>
              <input
                type="radio"
                name="mode"
                checked={mode === m.id}
                onChange={() => {
                  setMode(m.id);
                  const ok = applyMode(m.id);
                  setNote(
                    ok
                      ? `${m.label} is set. Change anything below to adjust it; new recordings use the pace and tone.`
                      : `${m.label} is set for now. This browser would not save it.`,
                  );
                  onApplied?.();
                }}
              />
              <span className="vname">
                {m.label}
                <span className="small muted"> {m.note}</span>
              </span>
            </label>
          </div>
        ))}
      </fieldset>
      {note && <p className="small muted">{note}</p>}
    </>
  );
}
