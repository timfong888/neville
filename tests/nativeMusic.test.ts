// #163: background music under a loop. The choice and its levels come from the web app (lib/music.ts);
// the seam plays the music as a second looping player that follows the voice session.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Made } from "@/lib/create";
import { DEFAULT_MUSIC_VOLUME, DUCK_GAIN, musicGain } from "@/lib/music";
import { MUSIC_KEY, MUSIC_VOLUME_KEY, bindMusic, makeMusicStore, musicEnabled, musicFor, parseMusic, parseVolume } from "@/native/src/player/music";
import { type MusicEngine, type MusicHandle, makeMusicPlayer } from "@/native/src/player/musicPlayer";
import type { KV } from "@/native/src/seams/kv.types";
import type { PlayState } from "@/native/src/seams/types";

type Fn = ReturnType<typeof vi.fn>;
const h = vi.hoisted(() => ({
  lists: [] as Array<{ sources: string[]; opts: { loop?: string }; emit(s: Record<string, unknown>): void; play: Fn; pause: Fn; destroy: Fn; setActiveForLockScreen: Fn }>,
  beds: [] as Array<{ src: unknown; loop: boolean; volume: number; play: Fn; pause: Fn; remove: Fn }>,
}));
vi.mock("expo-audio", () => ({
  setAudioModeAsync: vi.fn(async () => undefined),
  createAudioPlayer: (src: unknown) => {
    const bed = { src, loop: false, volume: 1, play: vi.fn(), pause: vi.fn(), remove: vi.fn(), fade: vi.fn() };
    h.beds.push(bed);
    return bed;
  },
  createAudioPlaylist: (opts: { sources: string[]; loop?: string }) => {
    let l: (s: Record<string, unknown>) => void = () => undefined;
    const list = {
      sources: opts.sources, opts, currentIndex: 0, play: vi.fn(), pause: vi.fn(), destroy: vi.fn(), setActiveForLockScreen: vi.fn(), clearLockScreenControls: vi.fn(),
      addListener: (_e: string, f: typeof l) => ((l = f), { remove: vi.fn() }),
      emit: (s: Record<string, unknown>) => l({ isLoaded: true, currentIndex: 0, trackCount: opts.sources.length, didJustFinish: false, duration: 10, currentTime: 1, ...s }),
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
    constructor(_d: string, name: string) {
      this.uri = `file:///cache/${name}`;
    }
    create() {}
    delete() {}
    write() {}
  },
}));
import { play as playCreate } from "@/native/src/create/playback";
import { audio } from "@/native/src/seams/audio.native";
import { musicPlayer } from "@/native/src/seams/music.native";

const memory = (seed: Record<string, string> = {}, refuse = false): KV & { data: Record<string, string> } => {
  const data = { ...seed };
  return { data, get: async (k) => data[k] ?? null, set: async (k, v) => (refuse ? false : ((data[k] = v), true)), remove: async (k) => void delete data[k] };
};
const state = (index: number, over: Partial<PlayState> = {}): Record<string, unknown> => ({ currentIndex: index, ...over });

const tick = () => new Promise((r) => setTimeout(r, 0));
const track = (id: "night-tide" | "morning-light" | "rise", volume = 0.3) => ({ id, src: `${id}.mp3`, volume });
/** Players that exist and are not removed or fading out: more than one is the bug (#184). */
const alive = () => h.beds.filter((b) => b.remove.mock.calls.length === 0 && b.fade.mock.calls.length === 0);

beforeEach(() => {
  // The music player is shared, as in the app: end any session left open and clear its choice.
  audio.open(["reset"], { title: "reset", onState: () => undefined }).stop();
  musicPlayer.setTarget(undefined);
  h.lists.length = 0;
  h.beds.length = 0;
});

describe("the music choice (acceptance 4)", () => {
  it("is Off at the web's default volume when nothing is stored", async () => {
    expect(await makeMusicStore(memory()).read()).toEqual({ choice: "none", volume: DEFAULT_MUSIC_VOLUME });
  });

  it("reads back a track and a volume, under the web's storage keys", async () => {
    const kv = memory();
    const store = makeMusicStore(kv);
    expect(await store.write({ choice: "night-tide", volume: 0.3 })).toBe(true);
    expect([MUSIC_KEY, MUSIC_VOLUME_KEY]).toEqual(["nv_music", "nv_music_volume"]);
    expect(kv.data).toEqual({ nv_music: "night-tide", nv_music_volume: "0.3" });
    expect(await makeMusicStore(kv).read()).toEqual({ choice: "night-tide", volume: 0.3 });
  });

  it("reads anything unknown as Off and an out-of-range volume as the default or the nearest end, and a refused write is false", async () => {
    expect([parseMusic("jazz"), parseMusic(null), parseMusic("rise"), parseMusic("none")]).toEqual(["none", "none", "rise", "none"]);
    expect([parseVolume("abc"), parseVolume(null), parseVolume("2"), parseVolume("-1"), parseVolume("0.25")]).toEqual([DEFAULT_MUSIC_VOLUME, DEFAULT_MUSIC_VOLUME, 1, 0, 0.25]);
    expect(await makeMusicStore(memory({}, true)).write({ choice: "rise" })).toBe(false);
  });

  it("tells subscribers after a write", async () => {
    const store = makeMusicStore(memory());
    const seen = vi.fn();
    store.subscribe(seen);
    await store.write({ volume: 0.5 });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("reads back the last choice made, however fast the taps came (#184)", async () => {
    const store = makeMusicStore(memory());
    const writes = [store.write({ choice: "night-tide" }), store.write({ choice: "rise" }), store.write({ choice: "none" })];
    expect(await store.read()).toEqual({ choice: "none", volume: DEFAULT_MUSIC_VOLUME });
    await Promise.all(writes);
    expect((await store.read()).choice).toBe("none");
  });

  it("keeps the other half when one is written", async () => {
    const store = makeMusicStore(memory({ nv_music: "rise", nv_music_volume: "0.2" }));
    await store.write({ volume: 0.4 });
    expect(await store.read()).toEqual({ choice: "rise", volume: 0.4 });
  });
});

describe("the music for a session (acceptance 1)", () => {
  const src = (id: string) => `${id}.mp3`;
  it("is nothing when the feature is off, or the choice is Off", () => {
    expect(musicFor({ choice: "rise", volume: 0.6 }, false, src)).toBeUndefined();
    expect(musicFor({ choice: "none", volume: 0.6 }, true, src)).toBeUndefined();
  });
  it("is the track at the web's level under the voice: the slider's gain at the dip under speech", () => {
    expect(musicFor({ choice: "rise", volume: 0.6 }, true, src)).toEqual({ id: "rise", src: "rise.mp3", volume: musicGain(0.6) * DUCK_GAIN });
    expect(musicFor({ choice: "rise", volume: 0 }, true, src)).toBeUndefined();
  });
  it("is on only when the build says so, and not by default", () => {
    expect([musicEnabled("1"), musicEnabled(undefined), musicEnabled("0"), musicEnabled("true")]).toEqual([true, false, false, false]);
  });
});

describe("the phone seam: the music is the one shared player, tied to the voice (acceptance 2, 3, 5)", () => {
  const open = (music = true, o: { loop?: boolean } = { loop: true }) => audio.open(["a", "gap"], { title: "t", loop: o.loop, music, onState: () => undefined });

  it("makes no second player without music, or with Off (acceptance 1)", async () => {
    open(false);
    await tick();
    expect(h.beds).toHaveLength(0);
    open(true);
    await tick();
    expect(h.beds).toHaveLength(0);
  });

  it("loops the track at the given volume, and starts and pauses with the voice", async () => {
    musicPlayer.setTarget(track("rise", 0.3));
    const s = open();
    await tick();
    expect(h.beds[0]).toMatchObject({ src: "rise.mp3", loop: true, volume: 0.3 });
    s.play();
    expect(h.beds[0].play).toHaveBeenCalledTimes(1);
    s.pause();
    expect(h.beds[0].pause).toHaveBeenCalledTimes(1);
  });

  it("follows the voice when the lock screen, a call or the bar pauses or resumes it, and when the screen is locked and unlocked", async () => {
    musicPlayer.setTarget(track("rise"));
    open();
    await tick();
    h.lists[0].emit(state(0, { playing: true }));
    h.lists[0].emit(state(0, { playing: false }));
    expect(h.beds[0].pause).toHaveBeenCalledTimes(1);
    h.lists[0].emit(state(0, { playing: true }));
    expect(h.beds[0].play).toHaveBeenCalledTimes(2);
    expect(alive()).toHaveLength(1);
  });

  it("is never the lock screen's player: only the voice puts its controls up", async () => {
    musicPlayer.setTarget(track("rise"));
    open();
    await tick();
    expect(h.lists[0].setActiveForLockScreen).toHaveBeenCalledTimes(1);
  });

  it("A to B while the voice plays: the first is removed, only the second sounds (#184)", async () => {
    musicPlayer.setTarget(track("night-tide"));
    const s = open();
    s.play();
    await tick();
    musicPlayer.setTarget(track("rise"));
    expect(h.beds[0].remove).toHaveBeenCalledTimes(1);
    await tick();
    expect(alive().map((b) => b.src)).toEqual(["rise.mp3"]);
    expect(h.beds[1].play).toHaveBeenCalledTimes(1);
  });

  it("Off while the voice plays: the music is removed, and the voice goes on (#184)", async () => {
    musicPlayer.setTarget(track("night-tide"));
    const s = open();
    s.play();
    await tick();
    musicPlayer.setTarget(undefined);
    expect(alive()).toHaveLength(0);
    expect(h.lists[0].destroy).not.toHaveBeenCalled();
    s.pause();
    s.play();
    await tick();
    expect(h.beds).toHaveLength(1);
  });

  it("rapid A, B, Off while the voice plays leaves nothing (#184)", async () => {
    const s = open();
    s.play();
    for (const t of [track("night-tide"), track("rise"), undefined]) musicPlayer.setTarget(t);
    await tick();
    expect(alive()).toHaveLength(0);
    expect(h.beds.every((b) => b.play.mock.calls.length === 0)).toBe(true);
  });

  it("a track chosen while paused sounds on Play, and the one before it is gone at once", async () => {
    musicPlayer.setTarget(track("night-tide"));
    const s = open();
    s.play();
    await tick();
    s.pause();
    musicPlayer.setTarget(track("rise"));
    expect(h.beds[0].remove).toHaveBeenCalledTimes(1);
    await tick();
    expect(h.beds[1].play).not.toHaveBeenCalled();
    s.play();
    expect(h.beds[1].play).toHaveBeenCalledTimes(1);
  });

  it("in loop mode the pause between rounds and the loop bell neither restart nor duplicate the music", async () => {
    musicPlayer.setTarget(track("rise"));
    const s = open(true, { loop: true });
    s.play();
    await tick();
    for (const i of [0, 1, 0, 1]) h.lists[0].emit(state(i, { playing: true, didJustFinish: true }));
    expect(h.beds).toHaveLength(1);
    expect(h.beds[0].remove).not.toHaveBeenCalled();
  });

  it("is removed when the session stops (leaving the screen, Stop), and a late choice makes no new player", async () => {
    musicPlayer.setTarget(track("rise"));
    open().stop();
    await tick();
    expect(alive()).toHaveLength(0);
    musicPlayer.setTarget(track("night-tide"));
    await tick();
    expect(h.beds.every((b) => b.remove.mock.calls.length === 1)).toBe(true);
    expect(alive()).toHaveLength(0);
  });

  it("is removed when another session replaces it, and the new session has one player", async () => {
    musicPlayer.setTarget(track("rise"));
    open();
    await tick();
    open();
    await tick();
    expect(h.beds[0].remove).toHaveBeenCalledTimes(1);
    expect(alive()).toHaveLength(1);
    audio.open(["b"], { title: "b", onState: () => undefined });
    expect(alive()).toHaveLength(0);
  });

  it("is removed when the recording finishes by itself, even if nothing calls stop", async () => {
    musicPlayer.setTarget(track("rise"));
    audio.open(["a"], { title: "t", music: true, onState: () => undefined });
    await tick();
    h.lists[0].emit(state(0, { playing: false, didJustFinish: true, trackCount: 1 }));
    expect(alive()).toHaveLength(0);
  });

  it("is removed when the clip cannot be played", async () => {
    vi.useFakeTimers();
    try {
      musicPlayer.setTarget(track("rise"));
      const s = audio.open(["a"], { title: "t", music: true, onState: () => undefined });
      await vi.advanceTimersByTimeAsync(0);
      s.play();
      await vi.advanceTimersByTimeAsync(9000);
      expect(alive()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the choice reaches the player at once, through the store (#184)", () => {
  it("rapid A, B, Off in the store, with the voice playing, ends with no music and the last reading wins", async () => {
    const store = makeMusicStore(memory());
    const off = bindMusic(store, (t) => musicPlayer.setTarget(t), true, (id) => `${id}.mp3`);
    const s = audio.open(["a"], { title: "t", music: true, onState: () => undefined });
    s.play();
    await store.write({ choice: "night-tide", volume: 0.5 });
    await tick();
    expect(alive().map((b) => b.src)).toEqual(["night-tide.mp3"]);
    const taps = [store.write({ choice: "rise" }), store.write({ choice: "morning-light" }), store.write({ choice: "none" })];
    await Promise.all(taps);
    await tick();
    expect(alive()).toHaveLength(0);
    expect(musicPlayer.view()).toEqual({ choice: "none", active: true });
    off();
  });

  it("does not play while the build has music off", async () => {
    const store = makeMusicStore(memory({ nv_music: "rise" }));
    const off = bindMusic(store, (t) => musicPlayer.setTarget(t), false, (id) => `${id}.mp3`);
    audio.open(["a"], { title: "t", music: true, onState: () => undefined }).play();
    await tick();
    expect(h.beds).toHaveLength(0);
    off();
  });

  it("a load that finishes late, after Off, is released and never plays", async () => {
    const late: Array<() => void> = [];
    const made: Array<{ play: Fn; remove: Fn }> = [];
    const engine: MusicEngine = {
      load: () =>
        new Promise<MusicHandle>((resolve) => {
          const m = { play: vi.fn(), pause: vi.fn(), setVolume: vi.fn(), remove: vi.fn() };
          made.push(m);
          late.push(() => resolve(m));
        }),
    };
    const p = makeMusicPlayer(engine);
    const store = makeMusicStore(memory());
    const off = bindMusic(store, p.setTarget, true, (id) => `${id}.mp3`);
    const f = p.attach();
    f.voice(true);
    await store.write({ choice: "rise" });
    await tick();
    await store.write({ choice: "none" });
    await tick();
    late[0]();
    await tick();
    expect(made[0].remove).toHaveBeenCalledTimes(1);
    expect(made[0].play).not.toHaveBeenCalled();
    off();
  });
});

describe("the web seam plays music through the same shared player", () => {
  class FakeAudio {
    static all: FakeAudio[] = [];
    src = "";
    loop = false;
    volume = 1;
    currentTime = 0;
    duration = Number.NaN;
    ended = false;
    onplay: (() => void) | null = null;
    onpause: (() => void) | null = null;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeupdate: (() => void) | null = null;
    onloadeddata: (() => void) | null = null;
    oncanplay: (() => void) | null = null;
    onplaying: (() => void) | null = null;
    play = vi.fn(async () => this.onplay?.());
    pause = vi.fn();
    removeAttribute = vi.fn();
    constructor() {
      FakeAudio.all.push(this);
    }
  }
  beforeEach(() => {
    FakeAudio.all.length = 0;
    (globalThis as { Audio?: unknown }).Audio = FakeAudio;
  });

  it("loops at the volume, plays and pauses with the voice, swaps on a new choice, and is let go on stop", async () => {
    // Metro picks music.web.ts for the web build; here the plain name is the phone's, so point it at the web file.
    vi.resetModules();
    vi.doMock("@/native/src/seams/music", () => import("@/native/src/seams/music.web"));
    const { audio: web } = await import("@/native/src/seams/audio.web");
    const { musicPlayer: webMusic } = await import("@/native/src/seams/music.web");
    webMusic.setTarget({ id: "rise", src: "m.mp3", volume: 0.4 });
    const s = web.open(["a"], { title: "t", music: true, onState: () => undefined });
    await tick();
    const [, bed] = FakeAudio.all;
    expect(bed).toMatchObject({ src: "m.mp3", loop: true, volume: 0.4 });
    s.play();
    expect(bed.play).toHaveBeenCalled();
    s.pause();
    expect(bed.pause).toHaveBeenCalled();
    s.play();
    webMusic.setTarget({ id: "night-tide", src: "n.mp3", volume: 0.4 });
    expect(bed.removeAttribute).toHaveBeenCalledWith("src");
    await tick();
    const next = FakeAudio.all[2];
    expect(next).toMatchObject({ src: "n.mp3", loop: true });
    expect(next.play).toHaveBeenCalled();
    s.stop();
    expect(next.removeAttribute).toHaveBeenCalledWith("src");
    webMusic.setTarget(undefined);
  });

  it("adds no element without music", async () => {
    vi.resetModules();
    vi.doMock("@/native/src/seams/music", () => import("@/native/src/seams/music.web"));
    const { audio: web } = await import("@/native/src/seams/audio.web");
    web.open(["a"], { title: "t", onState: () => undefined });
    await tick();
    expect(FakeAudio.all).toHaveLength(1);
  });
});

describe("the Create recording step loops and carries music (acceptance 2)", () => {
  const rec = { audio: new ArrayBuffer(8), mime: "audio/mpeg", voiceId: "v", voiceName: "Voice", starts: [0, 0.5] };
  const made: Made = { lines: ["a", "b"], title: "Calm", note: "", recording: rec };
  const events = () => ({ onLine: vi.fn(), onEnd: vi.fn(), onError: vi.fn(), onPlaying: vi.fn() });
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("without loop is as before: one clip, no loop", async () => {
    playCreate(made, events());
    await tick();
    expect(h.lists[0].sources).toHaveLength(1);
    expect(h.lists[0].opts.loop).toBe("none");
  });

  it("with loop plays the recording then a pause, on repeat, and never ends; the lines follow only the recording", async () => {
    const ev = events();
    playCreate(made, ev, { loop: true });
    await tick();
    expect(h.lists[0].sources).toHaveLength(2);
    expect(h.lists[0].opts.loop).toBe("all");
    h.lists[0].emit(state(0, { playing: true, currentTime: 5, duration: 10 }));
    expect(ev.onLine).toHaveBeenCalledTimes(1);
    h.lists[0].emit(state(1, { playing: true, currentTime: 0.5, duration: 1.8, didJustFinish: false }));
    h.lists[0].emit(state(1, { playing: true, didJustFinish: true }));
    expect(ev.onLine).toHaveBeenCalledTimes(1);
    expect(ev.onEnd).not.toHaveBeenCalled();
  });

  it("with music opens the one music player, and finishing the recording removes it", async () => {
    musicPlayer.setTarget(track("rise"));
    const ev = events();
    const pb = playCreate(made, ev, { music: true });
    await tick();
    await tick();
    expect(h.beds[0]).toMatchObject({ src: "rise.mp3", loop: true, volume: 0.3 });
    h.lists[0].emit(state(0, { playing: true }));
    h.lists[0].emit(state(0, { playing: false, didJustFinish: true, trackCount: 1 }));
    expect(ev.onEnd).toHaveBeenCalled();
    expect(alive()).toHaveLength(0);
    expect(pb.active()).toBe(false);
  });

  it("leaving the recording step (stop) removes the music, and Play again makes one new player, not two", async () => {
    musicPlayer.setTarget(track("rise"));
    const pb = playCreate(made, events(), { music: true });
    await tick();
    await tick();
    pb.stop();
    expect(alive()).toHaveLength(0);
    playCreate(made, events(), { music: true });
    await tick();
    await tick();
    expect(alive()).toHaveLength(1);
  });
});

describe("the TestFlight build turns music on (#163)", () => {
  it("sets EXPO_PUBLIC_MUSIC=1 in the production profile, which musicEnabled reads as on", async () => {
    const { readFileSync } = await import("node:fs");
    const eas = JSON.parse(readFileSync("native/eas.json", "utf8")) as { build: { production: { env?: Record<string, string> } } };
    expect(musicEnabled(eas.build.production.env?.EXPO_PUBLIC_MUSIC)).toBe(true);
  });
});
