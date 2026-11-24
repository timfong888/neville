import type { AudioSeam } from "./types";

// The web reuses the browser's audio element. lib/musicBed.ts (Web Audio loop and
// ducking) plugs in here in Phase 1; this is the minimum the screens need.
export const audio: AudioSeam = {
  async configure() {},
  async save(_name, bytes, mime) {
    return URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  },
  play(src, o) {
    const a = new Audio(src);
    a.loop = !!o?.loop;
    if ("mediaSession" in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: o?.title ?? "Neville", artist: "Neville" });
    void a.play().catch(() => {});
    return { stop: () => a.pause() };
  },
  playSequence(srcs, o) {
    // Chained 'ended' events: close, but not gapless like the native playlist.
    let i = 0;
    let dead = false;
    let cur: { stop(): void } | null = null;
    const next = () => {
      if (dead) return;
      const a = new Audio(srcs[i++ % srcs.length]);
      a.onended = next;
      if ("mediaSession" in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: o?.title ?? "Neville", artist: "Neville" });
      void a.play().catch(() => {});
      cur = { stop: () => a.pause() };
    };
    next();
    return {
      stop() {
        dead = true;
        cur?.stop();
      },
    };
  },
};
