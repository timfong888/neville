// Programming mode (#77): a short refrain repeated for a long time, with an
// optional bell between repeats. Pure PCM maths, framework-free, so the native
// app can build one continuous file. A single file has no seam between repeats
// for the player to get wrong, whatever the player does at the end of a track.

/** 16-bit mono PCM as a WAV file. */
export function wavFromPcm(pcm: Int16Array, rate: number): Uint8Array {
  const bytes = pcm.length * 2;
  const out = new Uint8Array(44 + bytes);
  const v = new DataView(out.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + bytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, bytes, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, pcm[i], true);
  return out;
}

/** A sine tone with short fades so it starts and ends at zero (no click). */
export function tone(freq: number, ms: number, rate: number, gain = 0.5, fadeMs = 8): Int16Array {
  const n = Math.round((rate * ms) / 1000);
  const fade = Math.max(1, Math.round((rate * fadeMs) / 1000));
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const edge = Math.min(1, i / fade, (n - 1 - i) / fade);
    out[i] = Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * gain * edge * 32767);
  }
  return out;
}

/** A soft bell: a fundamental and two partials that die away over `ms`. */
export function bell(rate: number, ms = 1800, freq = 523.25, gain = 0.4): Int16Array {
  const n = Math.round((rate * ms) / 1000);
  const out = new Int16Array(n);
  const partials: Array<[number, number]> = [[1, 1], [2.76, 0.4], [5.4, 0.15]];
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    let s = 0;
    for (const [mult, amp] of partials) s += amp * Math.sin(2 * Math.PI * freq * mult * t) * Math.exp(-t * (2.2 + mult));
    const attack = Math.min(1, i / (rate * 0.004));
    out[i] = Math.round(Math.max(-1, Math.min(1, s * gain * attack)) * 32767);
  }
  return out;
}

export type RefrainPlan = {
  refrain: Int16Array;
  rate: number;
  repeats: number;
  /** Silence after each repeat, in ms. */
  gapMs: number;
  /** Played once between repeats (not after the last), mixed over the start of the gap. */
  bell?: Int16Array;
};

/** The refrain `repeats` times in one buffer, with the gap and the optional bell between repeats. */
export function renderRefrain(p: RefrainPlan): Int16Array {
  const gap = Math.round((p.rate * p.gapMs) / 1000);
  const between = Math.max(gap, p.bell?.length ?? 0);
  const total = p.repeats * p.refrain.length + Math.max(0, p.repeats - 1) * between;
  const out = new Int16Array(total);
  let at = 0;
  for (let r = 0; r < p.repeats; r++) {
    out.set(p.refrain, at);
    at += p.refrain.length;
    if (r < p.repeats - 1) {
      if (p.bell) out.set(p.bell, at);
      at += between;
    }
  }
  return out;
}

/** Seconds of audio the plan makes. */
export function refrainSeconds(p: Pick<RefrainPlan, "refrain" | "rate" | "repeats" | "gapMs" | "bell">): number {
  return renderRefrain(p).length / p.rate;
}
