import type { AudioSeam } from "./types";

const ARTIST = "Neville";
const media = () => (typeof navigator !== "undefined" && "mediaSession" in navigator ? navigator.mediaSession : null);

// The web audio seam: one <audio> element carries the whole session, as the
// website's player does, and Media Session gives the lock-screen controls.
export const audio: AudioSeam = {
  async configure() {},
  async save(_name, bytes, mime) {
    return URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
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
    const a = new Audio();
    let index = 0;
    let open = true;
    // What the listener asked for. The element also pauses by itself at the end of each clip.
    let want = false;
    // True from a change of clip until it plays, so the pause some browsers send with it is not taken for the listener's.
    let switching = false;
    const emit = (ended = false) => {
      if (!open) return;
      o.onState({ playing: want && !ended, index, ended });
      const ms = media();
      if (ms) ms.playbackState = ended ? "none" : want ? "playing" : "paused";
    };
    const start = () => void a.play().catch(() => ((want = false), emit()));
    const session = {
      play() {
        if (!open) return;
        want = true;
        start();
        emit();
      },
      pause() {
        if (!open) return;
        want = false;
        a.pause();
        emit();
      },
      stop() {
        if (!open) return;
        const ms = media();
        if (ms) {
          ms.playbackState = "none";
          ms.metadata = null;
          ms.setActionHandler("play", null);
          ms.setActionHandler("pause", null);
        }
        open = false;
        a.onended = a.onpause = a.onplay = a.onerror = null;
        a.pause();
        a.removeAttribute("src");
      },
    };
    a.onended = () => {
      if (index + 1 >= srcs.length) {
        want = false;
        return emit(true);
      }
      switching = true;
      a.src = srcs[++index];
      start();
      emit();
    };
    // A pause or play that did not come from the screen: headphones, the lock screen, another tab.
    a.onpause = () => {
      if (want && !a.ended && !switching) session.pause();
    };
    a.onplay = () => {
      switching = false;
      if (!want) ((want = true), emit());
    };
    // A clip that fails after play() resolved (network, decoding) rejects nothing, so it is caught here.
    a.onerror = () => {
      if (!open) return;
      want = false;
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
