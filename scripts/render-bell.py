#!/usr/bin/env python3
"""
Renders the light meditation bell played between repetitions in programming
mode (#77). Synthesised from scratch, not sampled: original to Neville and
dedicated to the public domain (CC0 1.0). Deterministic: the same script
makes the same file.

    python3 scripts/render-bell.py      # writes public/sounds/bell.wav

A small struck bell: a few inharmonic partials (the ratios of a struck bowl),
each with its own slow decay, a soft mallet attack and a slight beat between
two close partials, as a real bell has. 24 kHz 16-bit mono, the rate of the
default voice, so the app can mix it in without resampling.

Needs numpy.
"""
import os
import wave

import numpy as np

SR = 24000
LENGTH_S = 4.5
FUNDAMENTAL = 660.0  # light and clear, above the voice
# (ratio to the fundamental, level, decay time constant in s)
PARTIALS = [
    (1.000, 1.00, 1.60),
    (1.004, 0.55, 1.50),  # a close twin: the slow beat of a real bell
    (2.710, 0.42, 0.90),
    (5.150, 0.16, 0.45),
    (8.210, 0.06, 0.25),
]
PEAK_DBFS = -14.0  # sits well under the voice
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "sounds", "bell.wav")


def render() -> np.ndarray:
    t = np.arange(int(SR * LENGTH_S)) / SR
    tone = np.zeros_like(t)
    for ratio, level, tau in PARTIALS:
        tone += level * np.sin(2 * np.pi * FUNDAMENTAL * ratio * t) * np.exp(-t / tau)
    # A soft mallet: a 6 ms rise instead of a click.
    attack = np.clip(t / 0.006, 0, 1)
    tone *= attack
    # Fade the last 0.3 s to true silence.
    fade = np.clip((LENGTH_S - t) / 0.3, 0, 1)
    tone *= fade
    tone /= np.max(np.abs(tone))
    return tone * (10 ** (PEAK_DBFS / 20))


def main() -> None:
    pcm = (render() * 32767).astype("<i2")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with wave.open(OUT, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"wrote {os.path.normpath(OUT)}: {len(pcm) / SR:.1f} s, {os.path.getsize(OUT)} bytes")


if __name__ == "__main__":
    main()
