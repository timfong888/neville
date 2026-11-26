// #153: audio must keep playing when the app goes to the background, on every screen that plays.
// These pin the seam's audio mode, the root layout configuring it at start, and the Create step
// playing through the seam (no player of its own, no audio mode of its own).
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Made } from "@/lib/create";

type Listener = (s: Record<string, unknown>) => void;
const h = vi.hoisted(() => ({
  setAudioModeAsync: vi.fn(async (_m: unknown) => undefined),
  createAudioPlayer: vi.fn(),
  lists: [] as Array<{
    emit(s: Record<string, unknown>): void;
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    setActiveForLockScreen: ReturnType<typeof vi.fn>;
    clearLockScreenControls: ReturnType<typeof vi.fn>;
    sources: string[];
  }>,
  written: [] as string[],
}));

vi.mock("expo-audio", () => ({
  setAudioModeAsync: h.setAudioModeAsync,
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
vi.mock("expo-file-system", () => ({
  Paths: { cache: "/cache" },
  File: class {
    exists = false;
    uri: string;
    constructor(_dir: string, name: string) {
      this.uri = `file:///cache/${name}`;
    }
    create() {}
    delete() {}
    write() {
      h.written.push(this.uri);
    }
  },
}));

import { AUDIO_MODE, audio } from "@/native/src/seams/audio.native";
import { play } from "@/native/src/create/playback";
import { pauseWatch } from "@/native/src/create/pauseWatch";

const made = (recording: Made["recording"]): Made => ({ lines: ["a", "b", "c"], title: "Calm", note: "", recording });
const rec = { audio: new ArrayBuffer(8), mime: "audio/mpeg", voiceId: "v", voiceName: "Voice", starts: [0, 0.4, 0.8] };
const events = () => ({ onLine: vi.fn(), onEnd: vi.fn(), onError: vi.fn(), onPlaying: vi.fn() });
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  h.lists.length = 0;
  h.written.length = 0;
});

describe("the seam's audio mode", () => {
  it("is background playback that does not mix", () => {
    expect(AUDIO_MODE).toEqual({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" });
  });
  it("configure applies exactly that mode, once however often it is called", async () => {
    await audio.configure();
    await audio.configure();
    expect(h.setAudioModeAsync).toHaveBeenCalledTimes(1);
    expect(h.setAudioModeAsync).toHaveBeenCalledWith(AUDIO_MODE);
  });
  it("open puts the title on the lock screen", () => {
    audio.open(["file:///a.mp3"], { title: "Calm", onState: () => undefined });
    expect(h.lists[0].setActiveForLockScreen).toHaveBeenCalledWith(true, { title: "Calm", artist: "Neville" }, expect.anything());
  });
});

describe("the app starts the mode before any screen plays", () => {
  it("the root layout calls audio.configure", () => {
    const src = readFileSync("native/app/_layout.tsx", "utf8");
    expect(src).toMatch(/seams\/audio"/);
    expect(src).toMatch(/audio\.configure\(\)/);
  });
});

describe("the Create step plays through the seam", () => {
  it("opens one session with the recording and the title, and never sets its own mode", async () => {
    const ev = events();
    play(made(rec), ev);
    await tick();
    expect(h.createAudioPlayer).not.toHaveBeenCalled();
    // Any mode set is the seam's own, never a mode of the step's.
    for (const [m] of h.setAudioModeAsync.mock.calls) expect(m).toEqual(AUDIO_MODE);
    expect(h.lists).toHaveLength(1);
    expect(h.lists[0].sources).toEqual([expect.stringMatching(/create\.mp3$/)]);
    expect(h.lists[0].setActiveForLockScreen).toHaveBeenCalledWith(true, expect.objectContaining({ title: "Calm" }), expect.anything());
    expect(h.lists[0].play).toHaveBeenCalled();
  });
  it("asks the seam to configure before it opens, in case the launch call failed", async () => {
    const spy = vi.spyOn(audio, "configure");
    play(made(rec), events());
    await tick();
    expect(spy).toHaveBeenCalled();
    expect(h.lists).toHaveLength(1);
    spy.mockRestore();
  });
  it("still plays, and says so on screen, when the background mode could not be set", async () => {
    const spy = vi.spyOn(audio, "configure").mockRejectedValueOnce(new Error("no session"));
    const onWarn = vi.fn();
    const ev = { ...events(), onWarn };
    play(made(rec), ev);
    await tick();
    expect(onWarn).toHaveBeenCalledWith(expect.stringMatching(/background/i));
    expect(ev.onError).not.toHaveBeenCalled();
    expect(h.lists[0].play).toHaveBeenCalled();
    spy.mockRestore();
  });
  it("puts the lock screen controls up again once playing starts, once", async () => {
    play(made(rec), events());
    await tick();
    const set = h.lists[0].setActiveForLockScreen;
    expect(set).toHaveBeenCalledTimes(1);
    h.lists[0].emit({ playing: true });
    h.lists[0].emit({ playing: true, currentTime: 1, duration: 10 });
    expect(set).toHaveBeenCalledTimes(2);
  });
  it("follows the line from the playback position and ends when the clip ends", async () => {
    const ev = events();
    play(made(rec), ev);
    await tick();
    h.lists[0].emit({ playing: true, currentTime: 1, duration: 10 });
    h.lists[0].emit({ playing: true, currentTime: 5, duration: 10 });
    expect(ev.onLine.mock.calls.map((c) => c[0])).toEqual([0, 1]);
    h.lists[0].emit({ playing: false, didJustFinish: true });
    expect(ev.onEnd).toHaveBeenCalledTimes(1);
  });
  it("reports a pause from outside (call, lock screen, another app) and its resume, not the load", async () => {
    const ev = events();
    const pb = play(made(rec), ev);
    await tick();
    h.lists[0].emit({ playing: false, isLoaded: true });
    expect(ev.onPlaying).not.toHaveBeenCalled();
    h.lists[0].emit({ playing: true });
    h.lists[0].emit({ playing: false });
    expect(ev.onPlaying).toHaveBeenLastCalledWith(false);
    h.lists[0].play.mockClear();
    pb.resume();
    expect(h.lists[0].play).toHaveBeenCalled();
    h.lists[0].emit({ playing: true });
    expect(ev.onPlaying).toHaveBeenLastCalledWith(true);
  });
  it("reports a clip that cannot load", async () => {
    vi.useFakeTimers();
    try {
      const ev = events();
      play(made(rec), ev);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(8001);
      expect(ev.onError).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it("is no longer active once the clip ends, so the screen does not treat it as playing", async () => {
    const ev = events();
    const pb = play(made(rec), ev);
    await tick();
    expect(pb.active()).toBe(true);
    h.lists[0].emit({ playing: false, didJustFinish: true });
    expect(pb.active()).toBe(false);
  });
  it("stop frees the session and nothing fires after it", async () => {
    const ev = events();
    const pb = play(made(rec), ev);
    await tick();
    pb.stop();
    expect(h.lists[0].destroy).toHaveBeenCalled();
    h.lists[0].emit({ playing: true, currentTime: 5, duration: 10 });
    expect(ev.onLine).not.toHaveBeenCalled();
  });
  it("stopping before the file is saved opens no session", async () => {
    const pb = play(made(rec), events());
    pb.stop();
    await tick();
    expect(h.lists).toHaveLength(0);
  });
});

describe("the Create step tells the person why playback paused", () => {
  const setup = () => {
    vi.useFakeTimers();
    const explain = vi.fn();
    return { explain, w: pauseWatch(explain) };
  };
  it("explains a pause reported while away, once", () => {
    const { explain, w } = setup();
    w.appState("background", true, false);
    w.playing(false);
    expect(explain).toHaveBeenCalledTimes(1);
    w.playing(false);
    expect(explain).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it("explains a pause reported after the app is back in front, within the grace period", () => {
    const { explain, w } = setup();
    w.appState("background", true, false);
    w.appState("active", true, false);
    expect(explain).not.toHaveBeenCalled();
    w.playing(false);
    expect(explain).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it("explains a pause already seen when the app returns", () => {
    const { explain, w } = setup();
    w.appState("background", true, false);
    w.appState("active", false, true);
    expect(explain).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it("says nothing for a pause long after the return, or one that began before leaving", () => {
    const { explain, w } = setup();
    w.appState("background", true, false);
    w.appState("active", true, false);
    vi.advanceTimersByTime(800);
    w.playing(false);
    w.appState("background", false, true);
    w.appState("active", false, true);
    w.playing(false);
    expect(explain).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it("keeps the note for a second trip away within the grace period of the first return", () => {
    const { explain, w } = setup();
    w.appState("background", true, false);
    w.appState("active", true, false);
    vi.advanceTimersByTime(200);
    w.appState("background", true, false);
    vi.advanceTimersByTime(1000);
    w.playing(false);
    expect(explain).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it("says nothing after the step resets", () => {
    const { explain, w } = setup();
    w.appState("background", true, false);
    w.reset();
    w.playing(false);
    expect(explain).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it("the screen shows the player's warning", () => {
    expect(readFileSync("native/app/create/recording.tsx", "utf8")).toMatch(/onWarn: setToast/);
  });
});

describe("the timer-only fallback", () => {
  it("is foreground only, so the screen can say so when the app leaves", () => {
    const pb = play(made(null), events());
    expect(pb.foregroundOnly).toBe(true);
    expect(pb.active()).toBe(true);
    pb.stop();
    expect(pb.active()).toBe(false);
  });
  it("a recording is not", async () => {
    const pb = play(made(rec), events());
    expect(pb.foregroundOnly).toBe(false);
    pb.stop();
  });
});
