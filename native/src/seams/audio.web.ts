import { musicPlayer } from "./music";
import type { AudioSeam } from "./types";

const ARTIST = "Neville";
/** How long the first clip may take to load before the session is reported as failed, as on a phone. */
const LOAD_TIMEOUT_MS = 8000;
// One address per saved name. Saving a name again frees the clip it held before.
const saved = new Map<string, string>();
// Addresses an open session may still load, and replaced ones waiting for that session to stop.
const inUse = new Map<string, number>();
const stale = new Set<string>();
function put(name: string, blob: Blob): string {
  const old = saved.get(name);
  if (old) inUse.get(old) ? stale.add(old) : URL.revokeObjectURL(old);
  const url = URL.createObjectURL(blob);
  saved.set(name, url);
  return url;
}
const media = () => (typeof navigator !== "undefined" && "mediaSession" in navigator ? navigator.mediaSession : null);

// The web audio seam: one <audio> element carries the whole session, as the
// website's player does, and Media Session gives the lock-screen controls.
// Ends the open session. One at a time: a new session ends the one before it.
let current: (() => void) | null = null;
let opened = 0;

export const audio: AudioSeam = {
  opened: () => opened,
  async configure() {},
  async save(name, bytes, mime) {
    return put(name, new Blob([bytes as BlobPart], { type: mime }));
  },
  // The library frees its addresses whenever it changes, in this tab or another, so the copy gets its own.
  async keep(name, src) {
    return put(name, await (await fetch(src)).blob());
  },
  duration(src) {
    return new Promise((resolve) => {
      const a = new Audio();
      const done = (n: number) => resolve(Number.isFinite(n) ? n : 0);
      a.onloadedmetadata = () => done(a.duration);
      a.onerror = () => done(0);
      setTimeout(() => done(0), 4000);
      a.preload = "metadata";
      a.src = src;
    });
  },
  open(srcs, o) {
    opened++;
    current?.();
    const a = new Audio();
    const mine = [...new Set(srcs)];
    for (const u of mine) inUse.set(u, (inUse.get(u) ?? 0) + 1);
    // The music is the app's one other player; this session only tells it what the voice is doing.
    const bed = o.music ? musicPlayer.attach() : null;
    let index = 0;
    let open = true;
    // What the listener asked for. The element also pauses by itself at the end of each clip.
    let want = false;
    // True from a change of clip until it plays, so the pause some browsers send with it is not taken for the listener's.
    let switching = false;
    const emit = (ended = false) => {
      if (!open) return;
      o.onState({ playing: want && !ended, index, ended, progress: a.duration > 0 ? Math.min(1, a.currentTime / a.duration) : undefined });
      const ms = media();
      if (ms) ms.playbackState = ended ? "none" : want ? "playing" : "paused";
    };
    // True once a clip has played. A refusal after that (the next clip, the lock screen's Play) only pauses,
    // so the listener keeps their place and can tap Play again.
    let everPlayed = false;
    // A request that stalls fires no event at all, so a session that has not loaded this long after Play has failed.
    let loaded = false;
    let watch: ReturnType<typeof setTimeout> | null = null;
    const markLoaded = () => {
      loaded = true;
      if (watch) clearTimeout(watch);
      watch = null;
    };
    const guard = () => {
      if (loaded || watch) return;
      watch = setTimeout(() => {
        watch = null;
        if (!open || loaded) return;
        want = false;
        a.pause();
        bed?.close();
        o.onState({ playing: false, index, ended: false, failed: true });
      }, LOAD_TIMEOUT_MS);
    };
    // A first play() the browser refuses (autoplay policy, unsupported source) is a failed start. Any other
    // rejection, such as an AbortError from pausing straight after play, is not.
    const start = () =>
      void a.play().catch((e: { name?: string }) => {
        want = false;
        if (open && !everPlayed && (e?.name === "NotAllowedError" || e?.name === "NotSupportedError")) {
          bed?.close();
          o.onState({ playing: false, index, ended: false, failed: true });
        } else emit();
      });
    const session = {
      play() {
        if (!open) return;
        want = true;
        start();
        bed?.voice(true);
        guard();
        emit();
      },
      pause() {
        if (!open) return;
        want = false;
        a.pause();
        bed?.voice(false);
        emit();
      },
      stop() {
        if (!open) return;
        if (current === end) current = null;
        const ms = media();
        if (ms) {
          ms.playbackState = "none";
          ms.metadata = null;
          ms.setActionHandler("play", null);
          ms.setActionHandler("pause", null);
        }
        open = false;
        if (watch) clearTimeout(watch);
        watch = null;
        a.onended = a.onpause = a.onplay = a.onerror = a.ontimeupdate = a.onloadeddata = a.oncanplay = a.onplaying = null;
        a.pause();
        a.removeAttribute("src");
        bed?.close();
        for (const u of mine) {
          const n = (inUse.get(u) ?? 1) - 1;
          if (n > 0) inUse.set(u, n);
          else {
            inUse.delete(u);
            if (stale.delete(u)) URL.revokeObjectURL(u);
          }
        }
      },
    };
    const end = () => {
      if (open) o.onState({ playing: false, index, ended: true, replaced: true });
      session.stop();
    };
    current = end;
    a.onended = () => {
      if (index + 1 >= srcs.length && !o.loop) {
        want = false;
        bed?.close();
        return emit(true);
      }
      switching = true;
      index = (index + 1) % srcs.length;
      a.src = srcs[index];
      start();
      emit();
    };
    // A pause or play that did not come from the screen: headphones, the lock screen, another tab.
    a.onpause = () => {
      if (want && !a.ended && !switching) session.pause();
    };
    a.ontimeupdate = () => emit();
    a.onloadeddata = a.oncanplay = a.onplaying = markLoaded;
    a.onplay = () => {
      everPlayed = true;
      switching = false;
      if (!want) ((want = true), emit());
    };
    // A clip that fails after play() resolved (network, decoding) rejects nothing, so it is caught here.
    a.onerror = () => {
      if (!open) return;
      want = false;
      bed?.close();
      o.onState({ playing: false, index, ended: false, failed: true });
      const m = media();
      if (m) m.playbackState = "none";
    };
    a.src = srcs[0];
    const ms = media();
    if (ms) {
      if (typeof MediaMetadata !== "undefined") ms.metadata = new MediaMetadata({ title: o.title, artist: ARTIST });
      ms.setActionHandler("play", session.play);
      ms.setActionHandler("pause", session.pause);
    }
    return session;
  },
};
