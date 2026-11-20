// Browser playback helpers shared by the create page and the playlist player.

/** Where each line starts, as a share of the whole script, for read-along. */
export function lineStarts(lines: string[]): number[] {
  const total = lines.reduce((n, l) => n + l.length, 0) || 1;
  let at = 0;
  return lines.map((l) => {
    const start = at / total;
    at += l.length;
    return start;
  });
}

/**
 * Soft ambient pad made with WebAudio, so the prototype ships no audio files.
 *
 * It used to read as a hum: a 110 Hz sine carried most of the weight, 220.6 Hz
 * sat 0.6 Hz away from the 220 Hz octave and beat against it, and nothing
 * softened the plain sine tones. Now: no sub-bass root, a clean A major triad
 * (no detune, so nothing beats), a low-pass filter over the top, and a quieter,
 * slower swell.
 */
export function startPad(): () => void {
  const Ctx: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return () => {};
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0;
  const soften = ctx.createBiquadFilter();
  soften.type = "lowpass";
  soften.frequency.value = 700;
  soften.connect(master).connect(ctx.destination);
  master.gain.linearRampToValueAtTime(0.025, ctx.currentTime + 4);
  // A3, C#4, E4, A4: an A major chord an octave up from the old root.
  const oscs = [220, 277.18, 329.63, 440].map((f, i) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = i === 3 ? 0.2 : 0.4;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.03 + i * 0.02;
    const lg = ctx.createGain();
    lg.gain.value = 0.1;
    lfo.connect(lg).connect(g.gain);
    o.connect(g).connect(soften);
    o.start();
    lfo.start();
    return [o, lfo];
  });
  return () => {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
    setTimeout(() => {
      oscs.flat().forEach((o) => o.stop());
      void ctx.close();
    }, 700);
  };
}
