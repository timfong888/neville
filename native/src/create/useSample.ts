// Plays a voice's pre-made sample, one at a time. Used by Settings and Create's voice page.
import { useEffect, useRef, useState } from "react";
import { API_URL } from "../config";
import { createSamples } from "./sampleSession";

export function useSample() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState("");
  const samples = useRef(createSamples({ onPlaying: setPlaying, onError: setError }));
  const { stop } = samples.current;
  useEffect(() => stop, [stop]);

  /** Starts the sample for `id`, or stops it when it is the one playing. */
  const toggle = (id: string, sample: string) => {
    setError("");
    samples.current.toggle(id, `${API_URL}${sample}`);
  };
  return { playing, error, toggle, stop, clearError: () => setError("") };
}
