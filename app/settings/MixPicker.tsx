"use client";

import { useEffect, useState } from "react";
import { DEFAULT_MIX, MIXABLE_VOICES, paceSupport } from "@/lib/voiceMix";
import { readMix, readMixOn, writeMix, writeMixOn } from "@/lib/voiceMixStore";

/** Mix voices: new recordings rotate through a set of voices; playlists avoid the same voice twice in a row. */
export default function MixPicker() {
  const [on, setOn] = useState(false);
  const [mix, setMix] = useState<string[]>(DEFAULT_MIX);
  useEffect(() => {
    setOn(readMixOn());
    setMix(readMix());
  }, []);

  const toggle = (id: string) => {
    const next = mix.includes(id) ? mix.filter((x) => x !== id) : [...mix, id];
    if (!next.length) return; // keep at least one
    setMix(next);
    writeMix(next);
  };

  return (
    <>
      <label className="voicerow on">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setOn(e.target.checked);
            writeMixOn(e.target.checked);
          }}
        />
        <span className="vname">
          Mix voices
          <span className="small muted">
            {" "}
            Each new manifestation is recorded in the next voice below, and playlists avoid the same voice twice in a row.
            Off: everything uses the voice chosen above.
          </span>
        </span>
      </label>
      {on && (
        <fieldset className="voicelist">
          <legend className="small muted">Voices in the mix</legend>
          {MIXABLE_VOICES.map((v) => (
            <label key={v.id} className={`voicerow${mix.includes(v.id) ? " on" : ""}`}>
              <input type="checkbox" checked={mix.includes(v.id)} onChange={() => toggle(v.id)} />
              <span className="vname">
                {v.name}
                <span className="small muted">
                  {" "}
                  {v.provider}
                  {paceSupport(v) === "ignores" && " · ignores pace: Sleep and Brisk change only its pauses"}
                  {paceSupport(v) === "untested" && " · pace untested"}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </>
  );
}
