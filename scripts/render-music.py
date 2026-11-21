#!/usr/bin/env python3
"""
Renders Neville's background music: three loops composed for the app and
dedicated to the public domain (CC0 1.0). Deterministic: the same script makes
the same files.

    python3 scripts/render-music.py            # writes public/music/*.mp3
    python3 scripts/render-music.py --check    # prints the level/spectrum report

Every loop is rendered circularly: notes and reverb tails that run past the end
wrap to the start, so the loop is exactly periodic. Each file holds
[MARGIN s of the loop's end][the loop][MARGIN s of the loop's start], and the
player loops between MARGIN and MARGIN + length (lib/music.ts), so the seam
falls inside continuous audio and decoder padding cannot cause a gap.

Needs numpy and ffmpeg (libmp3lame).
"""
import json
import os
import subprocess
import sys

import numpy as np

SR = 44100
MARGIN = 1.0  # seconds of wrap-around on each side of the loop
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "music")


def hz(note):
    """'A4' -> 440.0. Sharps only."""
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    name, octave = note[:-1], int(note[-1])
    n = names.index(name) + 12 * (octave + 1)
    return 440.0 * 2 ** ((n - 69) / 12)


class Track:
    def __init__(self, seconds, seed):
        self.n = int(round(seconds * SR))
        self.l = np.zeros(self.n)
        self.r = np.zeros(self.n)
        self.rng = np.random.default_rng(seed)

    def add(self, start, sig, pan=0.0):
        """Adds a mono signal at `start` seconds, wrapping past the end. pan -1..1."""
        i0 = int(round(start * SR)) % self.n
        gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        pos = 0
        while pos < len(sig):
            at = (i0 + pos) % self.n
            take = min(len(sig) - pos, self.n - at)
            self.l[at : at + take] += sig[pos : pos + take] * gl
            self.r[at : at + take] += sig[pos : pos + take] * gr
            pos += take


def env_adsr(n, a, d, s, r_start, r):
    """Attack, decay to sustain level s, hold, release from r_start (seconds)."""
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), 1.0)
    e = np.where((t >= a) & (t < a + d), 1 - (1 - s) * (t - a) / max(d, 1e-4), e)
    e = np.where(t >= a + d, s, e)
    rel = np.clip(1 - (t - r_start) / max(r, 1e-4), 0, 1)
    return e * np.where(t >= r_start, rel, 1.0)


def piano(f, dur, vel, bright=1.0):
    """Soft felt-piano-like tone: harmonic partials that decay faster as they rise."""
    n = int((dur + 2.5) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, 9):
        fk = f * k * (1 + 0.0004 * k * k)  # slight stiffness, like a real string
        if fk > 5000:
            break
        amp = (1 / k ** 1.6) * (bright if k > 2 else 1)
        decay = 1.6 + 0.9 * k
        out += amp * np.sin(2 * np.pi * fk * t) * np.exp(-decay * t / (1 + 0.6 * (f < 300)))
    attack = np.clip(t / 0.006, 0, 1)
    release = np.clip(1 - (t - dur) / 0.8, 0, 1)
    return vel * out * attack * np.where(t > dur, release, 1)


def pluck(f, vel):
    """Short plucked tone for the Active arpeggio."""
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, 7):
        if f * k > 6000:
            break
        out += (1 / k ** 1.3) * np.sin(2 * np.pi * f * k * t) * np.exp(-(5 + 3 * k) * t)
    return vel * out * np.clip(t / 0.003, 0, 1)


def pad(f, dur, vel, attack=2.5, release=3.5, warmth=1.0):
    """Warm pad: a few soft harmonics, slow swell. No detune within a voice, so nothing beats."""
    n = int((dur + release) * SR)
    t = np.arange(n) / SR
    phase = np.random.default_rng(int(f * 10)).uniform(0, 2 * np.pi, 4)
    out = (
        np.sin(2 * np.pi * f * t + phase[0])
        + 0.28 * warmth * np.sin(2 * np.pi * 2 * f * t + phase[1])
        + 0.10 * warmth * np.sin(2 * np.pi * 3 * f * t + phase[2])
        + 0.04 * warmth * np.sin(2 * np.pi * 4 * f * t + phase[3])
    )
    return vel * out * env_adsr(n, attack, 1.0, 0.85, dur, release)


def kick(vel):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 62 + 90 * np.exp(-t * 35)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return vel * np.sin(ph) * np.exp(-t * 9)


def shaker(rng, vel):
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    # crude high-pass: first difference twice
    noise = np.diff(np.diff(noise, prepend=0), prepend=0)
    return vel * 0.25 * noise * np.exp(-t * 45) * np.clip(t / 0.004, 0, 1)


def fft_lowpass(x, cutoff, slope_hz=800):
    """Circular low-pass in the frequency domain (exactly periodic, so loop-safe)."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    gain = np.clip(1 - (f - cutoff) / slope_hz, 0, 1)
    gain = gain ** 2
    return np.fft.irfft(X * gain, n=len(x))


def fft_highpass(x, cutoff, slope_hz=40):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    gain = np.clip((f - (cutoff - slope_hz)) / slope_hz, 0, 1)
    return np.fft.irfft(X * gain, n=len(x))


def reverb(tr, rt60, wet, seed, damp_hz=4500):
    """Circular convolution with a decaying-noise impulse response, different per side."""
    rng = np.random.default_rng(seed)
    m = int(rt60 * 1.2 * SR)
    t = np.arange(m) / SR
    out = []
    for side, dry in ((0, tr.l), (1, tr.r)):
        ir = rng.standard_normal(m) * np.exp(-6.9 * t / rt60)
        ir[: int(0.012 * SR)] = 0  # pre-delay
        ir_full = np.zeros(tr.n)
        ir_full[: min(m, tr.n)] = ir[: min(m, tr.n)]
        ir_full = fft_lowpass(ir_full, damp_hz, 3000)
        ir_full /= np.sqrt(np.sum(ir_full ** 2)) + 1e-12
        wet_sig = np.fft.irfft(np.fft.rfft(dry) * np.fft.rfft(ir_full), n=tr.n)
        out.append(dry * (1 - wet) + wet_sig * wet * 1.6)
    tr.l, tr.r = out


def master(tr, target_rms_db=-20.0, peak_db=-3.0, lp=None):
    l, r = tr.l, tr.r
    if lp:
        l, r = fft_lowpass(l, lp, 2500), fft_lowpass(r, lp, 2500)
    l, r = fft_highpass(l, 45), fft_highpass(r, 45)
    rms = np.sqrt(np.mean((l ** 2 + r ** 2) / 2))
    g = 10 ** (target_rms_db / 20) / (rms + 1e-12)
    l, r = l * g, r * g
    peak = max(np.max(np.abs(l)), np.max(np.abs(r)))
    ceiling = 10 ** (peak_db / 20)
    if peak > ceiling:
        # gentle soft clip above 70% of the ceiling instead of a hard cut
        knee = 0.7 * ceiling
        def soft(x):
            a = np.abs(x)
            over = a > knee
            y = x.copy()
            y[over] = np.sign(x[over]) * (knee + (ceiling - knee) * np.tanh((a[over] - knee) / (ceiling - knee)))
            return y
        l, r = soft(l), soft(r)
    tr.l, tr.r = l, r


# ---------------------------------------------------------------- the pieces


def waves(tr, vel, period=11.0):
    """Distant surf: soft low-passed noise that swells and recedes. Broadband, so it reads as air, never as a tone."""
    noise = tr.rng.standard_normal(tr.n)
    noise = fft_lowpass(noise, 900, 700)
    noise = fft_highpass(noise, 160, 80)
    t = np.arange(tr.n) / SR
    # whole number of swells per loop, so the loop stays periodic
    k = max(1, round(tr.n / SR / period))
    swell = 0.55 + 0.45 * np.sin(2 * np.pi * k * t / (tr.n / SR)) ** 2
    sig = noise / (np.std(noise) + 1e-12) * swell * vel
    tr.l += sig
    tr.r += np.roll(sig, int(0.37 * SR))


def sleep_track():
    """'Night Tide': D major, chords every 12 s, slow low piano, distant surf, long hall. No sub-bass drone."""
    chords = [
        ["D3", "A3", "E4", "F#4"],
        ["F#3", "B3", "D4", "A4"],
        ["G3", "B3", "D4", "F#4"],
        ["E3", "A3", "C#4", "B4"],
    ]
    bars = 12.0
    cycles = 3
    tr = Track(bars * len(chords) * cycles, seed=11)
    scale = ["D4", "E4", "F#4", "A4", "B4", "D5", "E5", "F#5"]
    t = 0.0
    for c in range(cycles):
        for ch in chords:
            for i, note in enumerate(ch):
                tr.add(t, pad(hz(note), bars + 0.5, 0.032, attack=4.0, release=6.0, warmth=0.6), pan=(-0.45 + 0.3 * i))
            # slow piano: a note every 2-4 s, mostly stepwise, soft and dark
            k = 0.5 + tr.rng.uniform(0, 1.0)
            idx = int(tr.rng.integers(0, len(scale)))
            while k < bars - 0.5:
                idx = int(np.clip(idx + tr.rng.integers(-2, 3), 0, len(scale) - 1))
                tr.add(t + k, piano(hz(scale[idx]), 2.8, 0.09 + tr.rng.uniform(0, 0.03), bright=0.55), pan=tr.rng.uniform(-0.5, 0.5))
                k += 2.2 + tr.rng.uniform(0, 1.8)
            t += bars
    waves(tr, 0.012)
    reverb(tr, rt60=4.5, wet=0.55, seed=21, damp_hz=3200)
    master(tr, target_rms_db=-21, lp=3800)
    return tr


def calm_track():
    """'Morning Light': C major, gentle piano arpeggios at 72 BPM over a soft pad."""
    bpm = 72
    beat = 60 / bpm
    chords = [
        ["C3", "G3", "B3", "E4"],
        ["A2", "E3", "G3", "C4"],
        ["F2", "C3", "E3", "A3"],
        ["G2", "D3", "E3", "B3"],
    ]
    per_chord = 8 * beat  # two bars of 4/4
    cycles = 4
    tr = Track(per_chord * len(chords) * cycles, seed=12)
    t = 0.0
    for c in range(cycles):
        for ch in chords:
            for i, note in enumerate(ch[1:]):
                tr.add(t, pad(hz(note) * 2, per_chord + 0.3, 0.025, attack=1.8, release=3.0, warmth=0.6), pan=-0.3 + 0.3 * i)
            root = hz(ch[0]) * (2 if hz(ch[0]) < 120 else 1)
            tr.add(t, pad(root, per_chord, 0.03, attack=1.0, release=2.5, warmth=0.5))
            # arpeggio in eighths: up through the chord an octave higher, then back
            up = [hz(n) * 2 for n in ch] + [hz(ch[1]) * 4]
            pattern = up + up[-2:0:-1]
            for e in range(16):
                if c == 0 and e % 2 == 1:
                    continue  # first time round: quarter notes, so the piece eases in
                f = pattern[e % len(pattern)]
                vel = 0.07 + (0.02 if e % 4 == 0 else 0) + tr.rng.uniform(-0.008, 0.008)
                tr.add(t + e * beat / 2 + tr.rng.uniform(0, 0.01), piano(f, beat * 0.9, vel, bright=0.8), pan=(e % 4 - 1.5) * 0.25)
            t += per_chord
    reverb(tr, rt60=2.6, wet=0.42, seed=22, damp_hz=5000)
    master(tr, target_rms_db=-20, lp=6000)
    return tr


def active_track():
    """'Rise': E major, 104 BPM, I-vi-IV-V, plucked sixteenths, soft kick and shaker."""
    bpm = 104
    beat = 60 / bpm
    chords = [
        ["E3", "B3", "E4", "G#4"],
        ["C#3", "G#3", "C#4", "E4"],
        ["A2", "E3", "A3", "C#4"],
        ["B2", "F#3", "B3", "D#4"],
    ]
    bar = 4 * beat
    cycles = 8  # 32 bars
    tr = Track(bar * len(chords) * cycles, seed=13)
    t = 0.0
    for c in range(cycles):
        drums = c not in (0, 4)  # first bars of each half breathe without the kick
        for ch in chords:
            for i, note in enumerate(ch[1:]):
                tr.add(t, pad(hz(note), bar + 0.2, 0.03, attack=0.4, release=1.2, warmth=0.8), pan=-0.35 + 0.35 * i)
            # bass on eighths
            for e in range(8):
                tr.add(t + e * beat / 2, pluck(hz(ch[0]), 0.045 if e % 2 == 0 else 0.03))
            # plucked arpeggio in sixteenths, two octaves up
            arp = [hz(n) * 2 for n in ch[1:]] + [hz(ch[1]) * 4]
            for s in range(16):
                f = arp[(s * 3) % len(arp)]
                vel = 0.05 + (0.025 if s % 4 == 0 else 0)
                tr.add(t + s * beat / 4, pluck(f, vel), pan=0.45 if s % 2 else -0.45)
            # piano chord stab on beats 1 and 3
            for b in (0, 2):
                for note in ch[1:]:
                    tr.add(t + b * beat, piano(hz(note) * 2, beat * 1.4, 0.035, bright=1.0), pan=0.1)
            if drums:
                for b in range(4):
                    tr.add(t + b * beat, kick(0.16))
                for e in range(8):
                    if e % 2 == 1:
                        tr.add(t + e * beat / 2, shaker(tr.rng, 0.6), pan=0.3)
                    else:
                        tr.add(t + e * beat / 2, shaker(tr.rng, 0.25), pan=0.3)
            t += bar
    reverb(tr, rt60=1.5, wet=0.25, seed=23, damp_hz=7000)
    master(tr, target_rms_db=-19, lp=9000)
    return tr


TRACKS = {
    "night-tide": ("Night Tide", "sleep", sleep_track),
    "morning-light": ("Morning Light", "calm", calm_track),
    "rise": ("Rise", "active", active_track),
}


def with_margins(tr):
    m = int(MARGIN * SR)
    l = np.concatenate([tr.l[-m:], tr.l, tr.l[:m]])
    r = np.concatenate([tr.r[-m:], tr.r, tr.r[:m]])
    return l, r


def write_mp3(path, l, r):
    pcm = (np.clip(np.stack([l, r], axis=1), -1, 1) * 32767).astype("<i2").tobytes()
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(SR), "-ac", "2", "-i", "-",
         "-codec:a", "libmp3lame", "-b:a", "112k", "-metadata", "copyright=CC0 1.0 (public domain)", path],
        input=pcm, check=True,
    )


def report(name, l, r):
    """Levels and spectrum: what a hum or buzz would show up as."""
    mono = (l + r) / 2
    rms = 20 * np.log10(np.sqrt(np.mean(mono ** 2)) + 1e-12)
    peak = 20 * np.log10(np.max(np.abs(np.concatenate([l, r]))) + 1e-12)
    spec = np.abs(np.fft.rfft(mono)) ** 2
    f = np.fft.rfftfreq(len(mono), 1 / SR)
    total = spec.sum()
    below150 = spec[f < 150].sum() / total
    # A hum or drone is the same strongest pitch second after second. Music moves.
    w1 = SR
    frames1 = mono[: len(mono) // w1 * w1].reshape(-1, w1) * np.hanning(w1)
    dom = np.argmax(np.abs(np.fft.rfft(frames1, axis=1))[:, 40:], axis=1) + 40  # Hz, 1 s frames
    longest, run = 1, 1
    for a, b in zip(dom[:-1], dom[1:]):
        run = run + 1 if abs(int(a) - int(b)) <= 2 else 1
        longest = max(longest, run)
    distinct = len({int(round(d / 3.0)) for d in dom})
    # short-term loudness spread (does it move like music, or drone flat?)
    w = SR // 2
    frames = mono[: len(mono) // w * w].reshape(-1, w)
    st = 20 * np.log10(np.sqrt(np.mean(frames ** 2, axis=1)) + 1e-9)
    return {
        "track": name,
        "rms_dbfs": round(rms, 1),
        "peak_dbfs": round(peak, 1),
        "energy_below_150hz": round(below150, 3),
        "distinct_dominant_pitches": distinct,
        "longest_same_dominant_pitch_s": longest,
        "short_term_level_range_db": round(float(np.percentile(st, 95) - np.percentile(st, 5)), 1),
    }


def old_pad(seconds=60):
    """The pad this replaces (lib/audio.ts startPad before and after #19), rendered offline for comparison."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for i, f in enumerate([220, 277.18, 329.63, 440]):
        g = (0.2 if i == 3 else 0.4) + 0.1 * np.sin(2 * np.pi * (0.03 + i * 0.02) * t)
        out += g * np.sin(2 * np.pi * f * t)
    out = fft_lowpass(out, 700, 200)
    return out, out


def main():
    os.makedirs(OUT, exist_ok=True)
    check = "--check" in sys.argv
    rows = []
    meta = {}
    for slug, (title, mode, fn) in TRACKS.items():
        tr = fn()
        loop_seconds = tr.n / SR
        rows.append(report(title, tr.l, tr.r))
        if not check:
            l, r = with_margins(tr)
            write_mp3(os.path.join(OUT, f"{slug}.mp3"), l, r)
        meta[slug] = {"title": title, "mode": mode, "loopStart": MARGIN, "loopEnd": round(MARGIN + loop_seconds, 6)}
    rows.append(report("old pad (replaced)", *old_pad()))
    print(json.dumps({"loops": meta, "report": rows}, indent=2))


if __name__ == "__main__":
    main()
