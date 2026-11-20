"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_MUSIC, DEFAULT_MUSIC_VOLUME, MUSIC_LICENSE, MUSIC_TRACKS, type MusicChoice } from "@/lib/music";
import { readMusicChoice, readMusicVolume, writeMusicChoice, writeMusicVolume } from "@/lib/musicStore";

/** Background music: which track (or none) and how loud. Previews play from the file, costing nothing. */
export default function MusicPicker() {
  const [music, setMusic] = useState<MusicChoice>(DEFAULT_MUSIC);
  const [volume, setVolume] = useState(DEFAULT_MUSIC_VOLUME);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const preview = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setMusic(readMusicChoice());
    setVolume(readMusicVolume());
    return () => preview.current?.pause();
  }, []);

  const listen = (src: string) => {
    preview.current?.pause();
    if (previewing === src) {
      setPreviewing(null);
      return;
    }
    const a = new Audio(src);
    a.currentTime = 1;
    a.volume = 0.5;
    a.onended = () => setPreviewing(null);
    preview.current = a;
    setPreviewing(src);
    void a.play().catch(() => setPreviewing(null));
  };

  const choose = (id: MusicChoice) => {
    setMusic(id);
    writeMusicChoice(id);
  };

  return (
    <>
      <fieldset className="voicelist">
        <legend className="small muted">Music</legend>
        {MUSIC_TRACKS.map((t) => (
          <div key={t.id} className={`voicerow${music === t.id ? " on" : ""}`}>
            <label>
              <input type="radio" name="music" checked={music === t.id} onChange={() => choose(t.id)} />
              <span className="vname">
                {t.title}
                <span className="small muted"> {t.mood}</span>
              </span>
            </label>
            <button className="btn sm ghost" onClick={() => listen(t.src)} aria-label={`Listen to ${t.title}`}>
              {previewing === t.src ? "■" : "▶"}
            </button>
          </div>
        ))}
        <div className={`voicerow${music === "none" ? " on" : ""}`}>
          <label>
            <input type="radio" name="music" checked={music === "none"} onChange={() => choose("none")} />
            <span className="vname">No music</span>
          </label>
        </div>
      </fieldset>
      <label className="small muted volume">
        Music volume
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            writeMusicVolume(v);
          }}
        />
      </label>
      <p className="small muted">
        The music dips while the voice speaks. All tracks are original to Neville and in the public domain (
        <a href={MUSIC_LICENSE.url}>CC0</a>).
      </p>
    </>
  );
}
