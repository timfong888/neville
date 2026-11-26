// #157: "Play all on loop" on the Library screen. The controller is framework-free and takes the
// audio seam and the Library's recordings as inputs, so it is tested with fakes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Manifestation } from "@/lib/library/model";
import { LOOP_GAP_MS, PLAYLIST_GAP_NAME, playerGapName } from "@/native/src/player/loop";
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
  type Opts = { title: string; loop?: boolean; onState(s: PlayState): void };
  const opens: Array<{ srcs: string[]; o: Opts; play: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
  const saved: string[] = [];
  const openers = new Set<() => void>();
  const changes = new Set<() => void>();
  const audio = {
    configure: async () => undefined,
    save: async (name: string) => (saved.push(name), `file:${name}`),
    onOpen: (fn: () => void) => (openers.add(fn), () => void openers.delete(fn)),
    open: (srcs: string[], o: Opts) => {
      openers.forEach((fn) => fn());
      const s = { srcs, o, play: vi.fn(), pause: vi.fn(), stop: vi.fn() };
      opens.push(s);
      return s;
    },
  };
  let load = async (): Promise<typeof items> => items;
  let loads = 0;
  const loop = makePlaylistLoop({ audio, load: () => (loads++, load()), onLibraryChange: (fn) => (changes.add(fn), () => void changes.delete(fn)) });
  const states: PlaylistState[] = [];
  loop.subscribe(() => states.push(loop.state()));
  return {
    loop, opens, saved, states, setLoad: (f: typeof load) => (load = f), loads: () => loads,
    /** Something else in the app opens a session (a Create preview, the Player). */
    otherOpens: () => audio.open(["x"], { title: "x", onState: () => undefined }),
    libraryChanges: () => changes.forEach((fn) => fn()),
  };
}
const st = (index: number, over: Partial<PlayState> = {}): PlayState => ({ playing: true, index, ended: false, ...over });

describe("Play all on loop", () => {
  it("opens one looping session with every recording once, a gap after each, in the Library's order (acceptance 1)", async () => {
    const f = fake();
    await f.loop.start();
    expect(f.opens).toHaveLength(1);
    expect(f.opens[0].srcs).toEqual(["c.wav", `file:${PLAYLIST_GAP_NAME}`, "b.wav", `file:${PLAYLIST_GAP_NAME}`, "a.wav", `file:${PLAYLIST_GAP_NAME}`]);
    expect(f.opens[0].o.loop).toBe(true);
    expect(f.opens[0].play).toHaveBeenCalledTimes(1);
    expect(LOOP_GAP_MS).toBeLessThanOrEqual(1800);
    expect(f.saved).toEqual([PLAYLIST_GAP_NAME]);
    expect([false, true].flatMap((l) => [false, true].map((b) => playerGapName(l, b)))).not.toContain(PLAYLIST_GAP_NAME);
  });

  it("shows the current title and place, following the session (acceptance 2)", async () => {
    const f = fake();
    await f.loop.start();
    expect(f.states[0].status).toBe("preparing");
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

  it("uses a Library that changed, not the earlier copy", async () => {
    const f = fake();
    await f.loop.prepare();
    f.setLoad(async () => [items[2]]);
    f.libraryChanges();
    await f.loop.start();
    expect(f.opens[0].srcs[0]).toBe("a.wav");
  });

  it("ends the loop when the Library changes, since a recording may be gone", async () => {
    const f = fake();
    await f.loop.start();
    f.libraryChanges();
    expect(f.opens[0].stop).toHaveBeenCalledTimes(1);
    expect(f.loop.state().status).toBe("idle");
  });

  it("ends the loop when another session opens, but not for its own", async () => {
    const f = fake();
    await f.loop.start();
    expect(f.loop.state().status).toBe("playing");
    f.otherOpens();
    expect(f.opens[0].stop).toHaveBeenCalledTimes(1);
    expect(f.loop.state().status).toBe("idle");
  });

  it("a session that opens while the loop is still preparing wins; the loop does not start over it", async () => {
    const f = fake();
    let release: (v: typeof items) => void = () => undefined;
    f.setLoad(() => new Promise((r) => (release = r)));
    const starting = f.loop.start();
    await new Promise((r) => setTimeout(r, 0));
    f.otherOpens();
    release(items);
    await starting;
    expect([f.opens.length, f.loop.state().status]).toEqual([1, "idle"]);
  });

  it("says a Library that could not be read failed, and tries again next time", async () => {
    const f = fake();
    f.setLoad(async () => {
      throw new Error("disk");
    });
    await f.loop.start();
    expect(f.opens).toHaveLength(0);
    expect(f.loop.state().status).toBe("idle");
    expect(f.loop.state().error).not.toMatch(/save a recording/i);
    f.setLoad(async () => items);
    await f.loop.start();
    expect(f.opens).toHaveLength(1);
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
});

it("the Player reads a stored All as Off", async () => {
  const { playerLoop } = await import("@/native/src/player/loop");
  expect([playerLoop("all"), playerLoop("one"), playerLoop(null)]).toEqual(["off", "one", "off"]);
});
