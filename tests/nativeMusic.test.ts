// #163: background music under a loop. The choice and its levels come from the web app (lib/music.ts);
// the seam plays the music as a second looping player that follows the voice session.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Made } from "@/lib/create";
import { DEFAULT_MUSIC_VOLUME, DUCK_GAIN, musicGain } from "@/lib/music";
import { MUSIC_KEY, MUSIC_VOLUME_KEY, makeMusicStore, musicEnabled, musicFor, parseMusic, parseVolume } from "@/native/src/player/music";
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
    const bed = { src, loop: false, volume: 1, play: vi.fn(), pause: vi.fn(), remove: vi.fn() };
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

const memory = (seed: Record<string, string> = {}, refuse = false): KV & { data: Record<string, string> } => {
  const data = { ...seed };
  return { data, get: async (k) => data[k] ?? null, set: async (k, v) => (refuse ? false : ((data[k] = v), true)), remove: async (k) => void delete data[k] };
};
const state = (index: number, over: Partial<PlayState> = {}): Record<string, unknown> => ({ currentIndex: index, ...over });

beforeEach(() => {
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
});

describe("the music for a session (acceptance 1)", () => {
  const src = (id: string) => `${id}.mp3`;
  it("is nothing when the feature is off, or the choice is Off", () => {
    expect(musicFor({ choice: "rise", volume: 0.6 }, false, src)).toBeUndefined();
    expect(musicFor({ choice: "none", volume: 0.6 }, true, src)).toBeUndefined();
  });
  it("is the track at the web's level under the voice: the slider's gain at the dip under speech", () => {
    expect(musicFor({ choice: "rise", volume: 0.6 }, true, src)).toEqual({ src: "rise.mp3", volume: musicGain(0.6) * DUCK_GAIN });
    expect(musicFor({ choice: "rise", volume: 0 }, true, src)).toBeUndefined();
  });
  it("is on only when the build says so, and not by default", () => {
    expect([musicEnabled("1"), musicEnabled(undefined), musicEnabled("0"), musicEnabled("true")]).toEqual([true, false, false, false]);
  });
});

describe("the phone seam plays music as a second player tied to the voice (acceptance 2, 3, 5)", () => {
  const open = (music?: { src: string; volume: number }) => audio.open(["a", "gap"], { title: "t", loop: true, music, onState: () => undefined });

  it("makes no second player without music (acceptance 1)", () => {
    open();
    expect(h.beds).toHaveLength(0);
  });

  it("loops the track at the given volume, and starts and pauses with the voice", () => {
    const s = open({ src: "m.mp3", volume: 0.3 });
    expect(h.beds[0]).toMatchObject({ src: "m.mp3", loop: true, volume: 0.3 });
    s.play();
    expect(h.beds[0].play).toHaveBeenCalledTimes(1);
    s.pause();
    expect(h.beds[0].pause).toHaveBeenCalledTimes(1);
  });

  it("follows the voice when the lock screen, a call or the bar pauses or resumes it", () => {
    open({ src: "m.mp3", volume: 0.3 });
    h.lists[0].emit(state(0, { playing: false }));
    expect(h.beds[0].pause).toHaveBeenCalled();
    h.lists[0].emit(state(1, { playing: true }));
    expect(h.beds[0].play).toHaveBeenCalled();
  });

  it("is never the lock screen's player: only the voice puts its controls up", () => {
    open({ src: "m.mp3", volume: 0.3 });
    expect(h.lists[0].setActiveForLockScreen).toHaveBeenCalledTimes(1);
  });

  it("is removed when the session stops, and when another session replaces it", () => {
    open({ src: "m.mp3", volume: 0.3 }).stop();
    expect(h.beds[0].remove).toHaveBeenCalledTimes(1);
    open({ src: "n.mp3", volume: 0.3 });
    audio.open(["b"], { title: "b", onState: () => undefined });
    expect(h.beds[1].remove).toHaveBeenCalledTimes(1);
    expect(h.beds).toHaveLength(2);
  });
});

describe("the web seam plays music as a second element", () => {
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

  it("loops at the volume, plays and pauses with the voice, and is let go on stop", async () => {
    const { audio: web } = await import("@/native/src/seams/audio.web");
    const s = web.open(["a"], { title: "t", music: { src: "m.mp3", volume: 0.4 }, onState: () => undefined });
    const [, bed] = FakeAudio.all;
    expect(bed).toMatchObject({ src: "m.mp3", loop: true, volume: 0.4 });
    s.play();
    expect(bed.play).toHaveBeenCalled();
    s.pause();
    expect(bed.pause).toHaveBeenCalled();
    s.stop();
    expect(bed.removeAttribute).toHaveBeenCalledWith("src");
  });

  it("adds no element without music", async () => {
    const { audio: web } = await import("@/native/src/seams/audio.web");
    web.open(["a"], { title: "t", onState: () => undefined });
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

  it("with music opens the second player", async () => {
    playCreate(made, events(), { music: { src: "m.mp3", volume: 0.3 } });
    await tick();
    expect(h.beds[0]).toMatchObject({ src: "m.mp3", loop: true, volume: 0.3 });
  });
});

describe("the TestFlight build turns music on (#163)", () => {
  it("sets EXPO_PUBLIC_MUSIC=1 in the production profile, which musicEnabled reads as on", async () => {
    const { readFileSync } = await import("node:fs");
    const eas = JSON.parse(readFileSync("native/eas.json", "utf8")) as { build: { production: { env?: Record<string, string> } } };
    expect(musicEnabled(eas.build.production.env?.EXPO_PUBLIC_MUSIC)).toBe(true);
  });
});
