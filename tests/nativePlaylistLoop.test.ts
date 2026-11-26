// #157: "Play all on loop" on the Library screen. The controller is framework-free and takes the
// audio seam and the Library's recordings as inputs, so it is tested with fakes.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Manifestation } from "@/lib/library/model";
import { LOOP_GAP_MS } from "@/native/src/player/loop";
import { type PlaylistState, makePlaylistLoop } from "@/native/src/player/playlistLoop";
import type { PlayState } from "@/native/src/seams/types";

const h = vi.hoisted(() => ({
  manifestations: [] as unknown[],
  uris: {} as Record<string, string | null>,
  kept: [] as string[],
}));
vi.mock("@/native/src/seams/library", () => ({
  library: { load: async () => ({ manifestations: h.manifestations }), audioUri: async (id: string) => h.uris[id] ?? null },
}));
vi.mock("@/native/src/seams/audio", () => ({
  audio: { keep: async (name: string, src: string) => (h.kept.push(name), `kept:${src}`) },
}));
import { libraryRecordings } from "@/native/src/player/copies";

const items = [
  { id: "c", src: "c.wav", title: "Calm" },
  { id: "b", src: "b.wav", title: "Brave" },
  { id: "a", src: "a.wav", title: "Awake" },
];

function fake() {
  const opens: Array<{ srcs: string[]; o: { title: string; loop?: boolean; onState(s: PlayState): void }; play: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
  const saved: string[] = [];
  const audio = {
    configure: async () => undefined,
    save: async (name: string) => (saved.push(name), `file:${name}`),
    open: (srcs: string[], o: { title: string; loop?: boolean; onState(s: PlayState): void }) => {
      const s = { srcs, o, play: vi.fn(), pause: vi.fn(), stop: vi.fn() };
      opens.push(s);
      return s;
    },
  };
  let load = async () => items;
  const loop = makePlaylistLoop({ audio, load: () => load() });
  const states: PlaylistState[] = [];
  loop.subscribe(() => states.push(loop.state()));
  return { loop, opens, saved, states, setLoad: (f: typeof load) => (load = f) };
}
const st = (index: number, over: Partial<PlayState> = {}): PlayState => ({ playing: true, index, ended: false, ...over });

describe("Play all on loop", () => {
  it("opens one looping session with every recording once, a gap after each, in the Library's order (acceptance 1)", async () => {
    const f = fake();
    await f.loop.start();
    expect(f.opens).toHaveLength(1);
    expect(f.opens[0].srcs).toEqual(["c.wav", "file:player-gap-loop-bell.wav", "b.wav", "file:player-gap-loop-bell.wav", "a.wav", "file:player-gap-loop-bell.wav"]);
    expect(f.opens[0].o.loop).toBe(true);
    expect(f.opens[0].play).toHaveBeenCalledTimes(1);
    expect(LOOP_GAP_MS).toBeLessThanOrEqual(1800);
  });

  it("shows the current title and place, following the session (acceptance 2)", async () => {
    const f = fake();
    await f.loop.start();
    expect(f.loop.state()).toMatchObject({ status: "playing", title: "Calm", position: 1, total: 3 });
    f.opens[0].o.onState(st(2));
    expect(f.loop.state()).toMatchObject({ title: "Brave", position: 2 });
    f.opens[0].o.onState(st(3)); // the gap after Brave
    expect(f.loop.state()).toMatchObject({ title: "Brave", position: 2 });
    f.opens[0].o.onState(st(0)); // wrapped to the first
    expect(f.loop.state()).toMatchObject({ title: "Calm", position: 1 });
    f.opens[0].o.onState(st(0, { playing: false }));
    expect(f.loop.state().status).toBe("paused");
  });

  it("reports preparing first, so the screen can show it", async () => {
    const f = fake();
    await f.loop.start();
    expect(f.states[0].status).toBe("preparing");
  });

  it("stop ends the session, clears the state and ignores anything reported after (acceptance 3)", async () => {
    const f = fake();
    await f.loop.start();
    f.loop.stop();
    expect(f.opens[0].stop).toHaveBeenCalledTimes(1);
    expect(f.loop.state()).toMatchObject({ status: "idle", title: "", total: 0 });
    f.opens[0].o.onState(st(2));
    expect(f.loop.state().status).toBe("idle");
  });

  it("opens nothing and says so when there is no recording (acceptance 4)", async () => {
    const f = fake();
    f.setLoad(async () => []);
    await f.loop.start();
    expect(f.opens).toHaveLength(0);
    expect(f.loop.state().status).toBe("idle");
    expect(f.loop.state().error).toMatch(/recording/i);
  });

  it("never leaves two sessions open (acceptance 5)", async () => {
    const f = fake();
    await Promise.all([f.loop.start(), f.loop.start()]);
    await f.loop.start();
    expect(f.opens).toHaveLength(1);
  });

  it("a stop while preparing opens nothing", async () => {
    const f = fake();
    const starting = f.loop.start();
    f.loop.stop();
    await starting;
    expect(f.opens).toHaveLength(0);
    expect(f.loop.state().status).toBe("idle");
  });

  it("stops and shows an error when a clip cannot be played, and can start again", async () => {
    const f = fake();
    await f.loop.start();
    f.opens[0].o.onState({ playing: false, index: 0, ended: false, failed: true });
    expect(f.opens[0].stop).toHaveBeenCalled();
    expect(f.loop.state()).toMatchObject({ status: "idle" });
    expect(f.loop.state().error).toMatch(/could not be played/i);
    await f.loop.start();
    expect(f.opens).toHaveLength(2);
  });

  it("uses a Library that changed after reset, not the earlier copy", async () => {
    const f = fake();
    await f.loop.prepare();
    f.setLoad(async () => [items[2]]);
    f.loop.reset();
    await f.loop.start();
    expect(f.opens[0].srcs[0]).toBe("a.wav");
  });
});

describe("the Library's recordings", () => {
  beforeEach(() => {
    h.kept.length = 0;
    const m = (id: string, title: string, hasAudio: boolean, createdAt: number) => ({ id, title, hasAudio, createdAt, updatedAt: createdAt, lines: [], voiceName: "", voiceId: "", want: "", firstName: "" }) as Manifestation;
    h.manifestations = [m("old", "Old", true, 1), m("none", "No audio", false, 2), m("new", "New", true, 3)];
    h.uris = { old: "u-old", new: "u-new" };
  });

  it("are the ones with audio, newest first, each copied once", async () => {
    const got = await libraryRecordings(() => false);
    expect(got.map((i) => i.id)).toEqual(["new", "old"]);
    expect(got.map((i) => i.src)).toEqual(["kept:u-new", "kept:u-old"]);
    expect(h.kept).toEqual(["player-loop-0", "player-loop-1"]);
  });

  it("stop at once when cancelled, copying nothing more", async () => {
    expect(await libraryRecordings(() => true)).toEqual([]);
    expect(h.kept).toEqual([]);
  });
});

describe("the Player", () => {
  const src = readFileSync("native/app/player/[id].tsx", "utf8");
  it("stops the Library loop when an item opens, so two sessions never play", () => {
    expect(src).toMatch(/playlist\.stop\(\)/);
  });
  it("offers only Off and One; All starts from the Library", () => {
    expect(src).not.toMatch(/LOOP_MODES/);
    expect(src).not.toMatch(/libraryItems|preparing/);
  });
  it("reads a stored All as Off", async () => {
    const { playerLoop } = await import("@/native/src/player/loop");
    expect(playerLoop("all")).toBe("off");
    expect(playerLoop("one")).toBe("one");
    expect(playerLoop(null)).toBe("off");
  });
});

describe("the Library screen", () => {
  const src = readFileSync("native/app/(tabs)/library.tsx", "utf8");
  it("has Play all on loop and a Stop", () => {
    expect(src).toMatch(/Play all on loop/);
    expect(src).toMatch(/Stop/);
  });
});
