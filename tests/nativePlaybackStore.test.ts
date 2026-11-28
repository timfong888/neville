// #262: one store, one control card. These tests fail on current main before this change.
import { describe, expect, it, vi } from "vitest";
import { isActive, makeNowPlaying, showsBar } from "@/native/src/player/nowPlaying";
import { makeMusicStore } from "@/native/src/player/music";
import { makeMusicPlayer } from "@/native/src/player/musicPlayer";
import type { KV } from "@/native/src/seams/kv.types";
import type { PlayState } from "@/native/src/seams/types";

type Opts = { title: string; loop?: boolean; onState(s: PlayState): void };
function fakeAudio() {
  const opens: Array<{ srcs: string[]; o: Opts; play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
  let count = 0;
  return {
    audio: {
      configure: async () => undefined,
      opened: () => count,
      open: (srcs: string[], o: Opts) => {
        count++;
        const s = { srcs, o, play: vi.fn(), pause: vi.fn(), stop: vi.fn() };
        opens.push(s);
        return s;
      },
    },
    opens,
  };
}
const job = (id = "m1") => ({
  id, title: `T-${id}`, route: `/player/${id}`, empty: "Nothing.",
  prepare: async () => ({ clips: [`${id}.wav`], loop: false, at: (i: number) => ({ title: `T${i}`, position: i + 1, total: 1 }) }),
});
const memory = (seed: Record<string, string> = {}): KV => {
  const data = { ...seed };
  return { get: async (k) => data[k] ?? null, set: async (k, v) => ((data[k] = v), true), remove: async (k) => void delete data[k] };
};

// Requirement 1: idle → no Stop visible in Library card.
describe("idle state: no Stop or Resume visible", () => {
  it("isActive is false when idle", () => {
    const { audio } = fakeAudio();
    const np = makeNowPlaying(audio);
    expect(isActive(np.state())).toBe(false);
    expect(showsBar(np.state())).toBe(false);
  });

  it("isActive false while preparing, true once playing, false after stop", async () => {
    const { audio, opens } = fakeAudio();
    const np = makeNowPlaying(audio);
    const starting = np.play(job());
    expect(isActive(np.state())).toBe(false);
    await starting;
    expect(isActive(np.state())).toBe(true);
    opens[0].o.onState({ playing: true, index: 0, ended: false });
    expect(isActive(np.state())).toBe(true);
    np.stop();
    expect(isActive(np.state())).toBe(false);
  });

  it("both store and card driven by one store instance: idle → playing → stopped-mid → playing → idle", async () => {
    const { audio, opens } = fakeAudio();
    const np = makeNowPlaying(audio);

    expect(np.state().status).toBe("idle");
    expect(isActive(np.state())).toBe(false);

    await np.play(job());
    opens[0].o.onState({ playing: true, index: 0, ended: false });
    expect(np.state().status).toBe("playing");
    expect(isActive(np.state())).toBe(true);

    // UI "Stop" → stopped-mid (position retained, session open).
    np.pause();
    expect(np.state().status).toBe("stopped-mid");
    expect(isActive(np.state())).toBe(true);
    expect(opens[0].stop).not.toHaveBeenCalled();

    // Resume → playing.
    np.resume();
    expect(np.state().status).toBe("playing");

    // "Start over" → idle.
    np.stop();
    expect(np.state().status).toBe("idle");
    expect(isActive(np.state())).toBe(false);
  });
});

// Requirement 2: state machine — no toggle, explicit pause/resume.
describe("state machine: pause, resume, stop", () => {
  it("makeNowPlaying exposes pause and resume, not toggle", () => {
    const { audio } = fakeAudio();
    const np = makeNowPlaying(audio);
    expect("pause" in np).toBe(true);
    expect("resume" in np).toBe(true);
    expect("toggle" in np).toBe(false);
  });

  it("lock screen / headphone pause → stopped-mid, session not ended", async () => {
    const { audio, opens } = fakeAudio();
    const np = makeNowPlaying(audio);
    await np.play(job());
    opens[0].o.onState({ playing: true, index: 0, ended: false });
    // System pauses audio.
    opens[0].o.onState({ playing: false, index: 0, ended: false });
    expect(np.state().status).toBe("stopped-mid");
    expect(opens[0].stop).not.toHaveBeenCalled();
  });

  it("when session finishes naturally → idle", async () => {
    const { audio, opens } = fakeAudio();
    const np = makeNowPlaying(audio);
    await np.play(job());
    opens[0].o.onState({ playing: false, index: 0, ended: true });
    expect(np.state().status).toBe("idle");
  });
});

// Requirement 3: changing music while playing updates the store once and the audio layer once.
describe("music store: single update on change", () => {
  it("write notifies subscribers exactly once per call", async () => {
    const store = makeMusicStore(memory());
    const calls = vi.fn();
    store.subscribe(calls);
    await store.write({ choice: "night-tide" });
    expect(calls).toHaveBeenCalledTimes(1);
    await store.write({ choice: "rise" });
    expect(calls).toHaveBeenCalledTimes(2);
  });

  it("changing track while playing replaces the previous player (no duplicate audio)", async () => {
    const handles: Array<{ play: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }> = [];
    const engine = {
      load: async (_src: unknown, _vol: number) => {
        const h = { play: vi.fn(), pause: vi.fn(), setVolume: vi.fn(), remove: vi.fn() };
        handles.push(h);
        return h;
      },
    };
    const player = makeMusicPlayer(engine);
    const f = player.attach();
    f.voice(true);

    player.setTarget({ id: "rise" as never, src: "rise.mp3", volume: 0.3 });
    await new Promise((r) => setTimeout(r, 0));
    expect(handles).toHaveLength(1);
    expect(handles[0].play).toHaveBeenCalled();

    player.setTarget({ id: "night-tide" as never, src: "night-tide.mp3", volume: 0.3 });
    await new Promise((r) => setTimeout(r, 0));
    expect(handles[0].remove).toHaveBeenCalledTimes(1);
    expect(handles).toHaveLength(2);
    expect(handles[1].play).toHaveBeenCalled();

    f.close();
  });
});
