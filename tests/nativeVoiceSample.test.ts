// #153 follow-up: voice-sample previews play through the audio seam (same audio mode as the Player
// and Create), one at a time, and a stuck or interrupted sample ends in a clear state.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (s: Record<string, unknown>) => void;
const h = vi.hoisted(() => ({
  createAudioPlayer: vi.fn(),
  lists: [] as Array<{
    emit(s: Record<string, unknown>): void;
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    setActiveForLockScreen: ReturnType<typeof vi.fn>;
    sources: string[];
  }>,
}));

vi.mock("expo-audio", () => ({
  setAudioModeAsync: vi.fn(async () => undefined),
  createAudioPlayer: h.createAudioPlayer,
  createAudioPlaylist: (o: { sources: string[] }) => {
    let l: Listener = () => undefined;
    const list = {
      sources: o.sources,
      currentIndex: 0,
      play: vi.fn(),
      pause: vi.fn(),
      destroy: vi.fn(),
      setActiveForLockScreen: vi.fn(),
      clearLockScreenControls: vi.fn(),
      addListener: (_e: string, f: Listener) => ((l = f), { remove: vi.fn() }),
      emit: (s: Record<string, unknown>) => l({ isLoaded: true, currentIndex: 0, trackCount: 1, didJustFinish: false, ...s }),
    };
    h.lists.push(list);
    return list;
  },
}));
vi.mock("expo-file-system", () => ({ Paths: { cache: "/cache" }, File: class {} }));

import { createSamples } from "@/native/src/create/sampleSession";

const setup = () => {
  const ev = { onPlaying: vi.fn(), onError: vi.fn() };
  return { ev, samples: createSamples(ev) };
};

beforeEach(() => {
  vi.clearAllMocks();
  h.lists.length = 0;
});

describe("voice samples", () => {
  it("play through the seam with a lock-screen title, never a player of their own", () => {
    const { ev, samples } = setup();
    samples.toggle("a", "https://x/a.mp3");
    expect(h.createAudioPlayer).not.toHaveBeenCalled();
    expect(h.lists[0].sources).toEqual(["https://x/a.mp3"]);
    expect(h.lists[0].setActiveForLockScreen).toHaveBeenCalledWith(true, expect.objectContaining({ title: "Voice sample" }), expect.anything());
    expect(h.lists[0].play).toHaveBeenCalled();
    expect(ev.onPlaying).toHaveBeenLastCalledWith("a");
  });
  it("stop when the same sample is tapped again", () => {
    const { ev, samples } = setup();
    samples.toggle("a", "u");
    samples.toggle("a", "u");
    expect(h.lists[0].destroy).toHaveBeenCalled();
    expect(ev.onPlaying).toHaveBeenLastCalledWith(null);
    expect(h.lists).toHaveLength(1);
  });
  it("are one at a time: starting another stops the first", () => {
    const { ev, samples } = setup();
    samples.toggle("a", "u1");
    samples.toggle("b", "u2");
    expect(h.lists[0].destroy).toHaveBeenCalled();
    expect(h.lists[1].play).toHaveBeenCalled();
    expect(ev.onPlaying).toHaveBeenLastCalledWith("b");
  });
  it("end by themselves", () => {
    const { ev, samples } = setup();
    samples.toggle("a", "u");
    h.lists[0].emit({ playing: false, didJustFinish: true });
    expect(ev.onPlaying).toHaveBeenLastCalledWith(null);
    expect(h.lists[0].destroy).toHaveBeenCalled();
  });
  it("end when something outside pauses them, but not during the load", () => {
    const { ev, samples } = setup();
    samples.toggle("a", "u");
    h.lists[0].emit({ playing: false, isLoaded: false });
    expect(ev.onPlaying).toHaveBeenLastCalledWith("a");
    h.lists[0].emit({ playing: true });
    h.lists[0].emit({ playing: false });
    expect(ev.onPlaying).toHaveBeenLastCalledWith(null);
  });
  it("report a sample that never loads, and stop it", () => {
    vi.useFakeTimers();
    try {
      const { ev, samples } = setup();
      samples.toggle("a", "u");
      vi.advanceTimersByTime(8001);
      expect(ev.onError).toHaveBeenCalledWith("That sample could not be played.");
      expect(ev.onPlaying).toHaveBeenLastCalledWith(null);
      expect(h.lists[0].destroy).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it("ignore events from a sample that was already replaced", () => {
    const { ev, samples } = setup();
    samples.toggle("a", "u1");
    samples.toggle("b", "u2");
    h.lists[0].emit({ playing: false, didJustFinish: true });
    expect(ev.onPlaying).toHaveBeenLastCalledWith("b");
  });
});
