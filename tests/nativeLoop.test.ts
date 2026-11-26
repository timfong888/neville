// #157: the Player's loop control (off, one, all). The queue and the stored choice are framework-free;
// the seams are checked with expo-audio and the browser's <audio> faked.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildQueue, gapClip, roundAt } from "@/lib/playerQueue";
import {
  DEFAULT_LOOP, LOOP_GAP_MS, LOOP_KEY, LOOP_MODES, loopQueue, makeLoopStore, parseLoop,
} from "@/native/src/player/loop";
import type { KV } from "@/native/src/seams/kv.types";
import type { PlayState } from "@/native/src/seams/types";

const h = vi.hoisted(() => ({
  made: [] as Array<{ opts: { sources: string[]; loop?: string }; emit(s: Record<string, unknown>): void; destroy: ReturnType<typeof vi.fn> }>,
}));
vi.mock("expo-audio", () => ({
  setAudioModeAsync: vi.fn(),
  createAudioPlayer: vi.fn(),
  createAudioPlaylist: (opts: { sources: string[]; loop?: string }) => {
    let l: (s: Record<string, unknown>) => void = () => undefined;
    const list = {
      opts,
      currentIndex: 0,
      play: vi.fn(),
      pause: vi.fn(),
      destroy: vi.fn(),
      setActiveForLockScreen: vi.fn(),
      clearLockScreenControls: vi.fn(),
      addListener: (_e: string, f: typeof l) => ((l = f), { remove: vi.fn() }),
      emit: (s: Record<string, unknown>) => l({ isLoaded: true, currentIndex: 0, trackCount: opts.sources.length, didJustFinish: false, duration: 10, currentTime: 1, ...s }),
    };
    h.made.push(list);
    return list;
  },
}));
vi.mock("expo-file-system", () => ({ Paths: { cache: "/cache" }, File: class {} }));

const memory = (seed: Record<string, string> = {}, refuse = false): KV & { data: Record<string, string> } => {
  const data = { ...seed };
  return {
    data,
    get: async (k) => data[k] ?? null,
    set: async (k, v) => (refuse ? false : ((data[k] = v), true)),
    remove: async (k) => void delete data[k],
  };
};

const lib = [
  { id: "a", src: "a.wav", title: "A" },
  { id: "b", src: "b.wav", title: "B" },
  { id: "c", src: "c.wav", title: "C" },
];

describe("the stored loop choice (acceptance 4)", () => {
  it("is Off with nothing stored", async () => {
    expect(DEFAULT_LOOP).toBe("off");
    expect(await makeLoopStore(memory()).read()).toBe("off");
  });

  it("reads back what was written, from a new store on the same storage", async () => {
    const kv = memory();
    expect(await makeLoopStore(kv).write("all")).toBe(true);
    expect(kv.data[LOOP_KEY]).toBe("all");
    expect(await makeLoopStore(kv).read()).toBe("all");
  });

  it("reads anything unknown as Off, and a refused write is false, not a throw", async () => {
    expect(parseLoop("forever")).toBe("off");
    expect(parseLoop(null)).toBe("off");
    expect(await makeLoopStore(memory({ [LOOP_KEY]: "forever" })).read()).toBe("off");
    expect(await makeLoopStore(memory({}, true)).write("one")).toBe(false);
    expect([...LOOP_MODES]).toEqual(["off", "one", "all"]);
  });
});

describe("the queue for loop all (acceptance 2)", () => {
  it("plays every recording once, a gap after each, starting at the opened one and keeping the Library's order", () => {
    const q = loopQueue("all", lib, "b", "GAP");
    expect(q.clips).toEqual(["b.wav", "GAP", "c.wav", "GAP", "a.wav", "GAP"]);
    expect(q.items.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("ends on a gap, so the wrap to the first clip has the same pause as every other change", () => {
    expect(loopQueue("all", lib, "a", "GAP").clips.at(-1)).toBe("GAP");
    expect(roundAt(2)).toEqual({ round: 2, inGap: false });
  });

  it("plays just the opened one when it is not in the list (the test tone)", () => {
    const q = loopQueue("all", [], "demo", "GAP", { id: "demo", src: "tone.wav", title: "Tone" });
    expect(q.clips).toEqual(["tone.wav", "GAP"]);
  });

  it("keeps the gap at 1.8 s or less, so the restart is within 2 s", () => {
    const wav = new DataView(gapClip(true, LOOP_GAP_MS).buffer);
    const seconds = wav.getUint32(40, true) / 2 / wav.getUint32(24, true);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(1.8);
    expect(LOOP_GAP_MS).toBeLessThanOrEqual(1800);
  });
});

describe("the queue for loop one (acceptance 3)", () => {
  it("is the opened recording and one gap, whatever else is in the Library", () => {
    const q = loopQueue("one", lib, "c", "GAP");
    expect(q.clips).toEqual(["c.wav", "GAP"]);
    expect(q.items.map((i) => i.id)).toEqual(["c"]);
  });
});

describe("loop off keeps today's queue", () => {
  it("is the recording with the minutes' repeats, no loop", () => {
    expect(buildQueue("v", "g", 2)).toEqual(["v", "g", "v", "g", "v"]);
  });
});

describe("the phone seam", () => {
  beforeEach(() => void (h.made.length = 0));
  const open = async (loop?: boolean) => {
    const { audio } = await import("@/native/src/seams/audio.native");
    const seen: PlayState[] = [];
    audio.open(["a", "g", "b", "g"], { title: "t", loop, onState: (s) => seen.push(s) });
    return { list: h.made[0], seen };
  };

  it("has no loop by default (acceptance 1): the end of the last clip is reported", async () => {
    const { list, seen } = await open();
    expect(list.opts.loop).toBe("none");
    list.emit({ currentIndex: 3, didJustFinish: true });
    expect(seen.at(-1)?.ended).toBe(true);
  });

  it("one session at a time: opening one ends the one before, which is told it was replaced (#161)", async () => {
    const { audio } = await import("@/native/src/seams/audio.native");
    const first: PlayState[] = [];
    audio.open(["a"], { title: "a", onState: (s) => first.push(s) });
    audio.open(["b"], { title: "b", onState: () => undefined });
    expect(h.made[0].destroy).toHaveBeenCalled();
    expect(first.at(-1)).toMatchObject({ playing: false, ended: true, replaced: true });
    expect(h.made[1].destroy).not.toHaveBeenCalled();
  });

  it("loops the whole playlist and never reports an end, so the Player does not stop it", async () => {
    const { list, seen } = await open(true);
    expect(list.opts.loop).toBe("all");
    list.emit({ currentIndex: 3, didJustFinish: true });
    list.emit({ currentIndex: 0, playing: true });
    expect(seen.some((s) => s.ended)).toBe(false);
    expect(seen.at(-1)?.index).toBe(0);
  });
});

describe("the web seam", () => {
  class FakeAudio {
    static all: FakeAudio[] = [];
    src = "";
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
    removeAttribute() {}
    constructor() {
      FakeAudio.all.push(this);
    }
  }
  beforeEach(() => {
    FakeAudio.all.length = 0;
    (globalThis as { Audio?: unknown }).Audio = FakeAudio;
  });
  const run = async (loop?: boolean) => {
    const { audio } = await import("@/native/src/seams/audio.web");
    const seen: PlayState[] = [];
    const s = audio.open(["a", "g", "b"], { title: "t", loop, onState: (x) => seen.push(x) });
    s.play();
    const el = FakeAudio.all[0];
    el.onended?.();
    el.onended?.();
    el.onended?.();
    return { el, seen };
  };

  it("one session at a time: opening one ends the one before, which is told it was replaced (#161)", async () => {
    const { audio } = await import("@/native/src/seams/audio.web");
    const seen: PlayState[] = [];
    audio.open(["a"], { title: "a", onState: (x) => seen.push(x) }).play();
    audio.open(["b"], { title: "b", onState: () => undefined });
    expect(FakeAudio.all[0].pause).toHaveBeenCalled();
    expect(seen.at(-1)).toMatchObject({ playing: false, ended: true, replaced: true });
  });

  it("stops at the end without loop", async () => {
    const { seen } = await run();
    expect(seen.at(-1)?.ended).toBe(true);
  });

  it("goes back to the first clip after the last, and keeps playing", async () => {
    const { el, seen } = await run(true);
    expect(el.src).toBe("a");
    expect(seen.some((s) => s.ended)).toBe(false);
    expect(seen.at(-1)).toMatchObject({ playing: true, index: 0 });
  });
});
