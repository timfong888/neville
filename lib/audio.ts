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

/** Soft ambient pad made with WebAudio, so the prototype ships no audio files. */
export function startPad(): () => void {
  const Ctx: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return () => {};
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  master.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 3);
  const oscs = [110, 164.81, 220.6, 277.18].map((f, i) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.9 : 0.35;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05 + i * 0.03;
    const lg = ctx.createGain();
    lg.gain.value = 0.25;
    lfo.connect(lg).connect(g.gain);
    o.connect(g).connect(master);
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

