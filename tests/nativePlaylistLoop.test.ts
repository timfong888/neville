// #161: one app-level audio controller, so playback outlives screens, with the Library's "Play all on loop"
// as one job it runs. Both are framework-free and take the audio seam as input, so they are tested with fakes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Manifestation } from "@/lib/library/model";
import { LOOP_GAP_MS, PLAYLIST_GAP_NAME, playerGapName } from "@/native/src/player/loop";
import { type PlayJob, type Prepared, makeNowPlaying, showsBar } from "@/native/src/player/nowPlaying";
import { makePlayAll } from "@/native/src/player/playAll";
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

type Opts = { title: string; loop?: boolean; onState(s: PlayState): void };
function fake() {
  const opens: Array<{ srcs: string[]; o: Opts; play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
  let count = 0;
  const audio = {
    configure: async () => undefined,
    opened: () => count,
    open: (srcs: string[], o: Opts) => {
      count++;
      const s = { srcs, o, play: vi.fn(), pause: vi.fn(), stop: vi.fn() };
      opens.push(s);
      return s;
    },
  };
  const np = makeNowPlaying(audio);
  const states = [np.state()];
  np.subscribe(() => states.push(np.state()));
  return { np, opens, states, otherOpens: () => void count++ };
}
const job = (id: string, over: Partial<PlayJob> = {}): PlayJob => ({
  id, title: `Lock ${id}`, route: `/player/${id}`, empty: "Nothing here.",
  prepare: async () => ({ clips: [`${id}.wav`, "gap", `${id}.wav`], loop: id === "all", at: (i) => ({ title: `T${id}${i}`, position: i + 1, total: 3 }) }),
  ...over,
});
const st = (index: number, over: Partial<PlayState> = {}): PlayState => ({ playing: true, index, ended: false, ...over });

describe("the app-level controller", () => {
  it("opens one session and shows what is playing, the lock screen title and the loop flag", async () => {
    const f = fake();
    await f.np.play(job("all"));
    expect(f.states.map((x) => x.status).slice(-2)).toEqual(["preparing", "playing"]);
    expect(f.opens).toHaveLength(1);
    expect(f.opens[0]).toMatchObject({ srcs: ["all.wav", "gap", "all.wav"], o: { title: "Lock all", loop: true } });
    expect(f.opens[0].play).toHaveBeenCalledTimes(1);
    expect(f.np.state()).toMatchObject({ status: "playing", id: "all", title: "Tall0", route: "/player/all", position: 1, total: 3 });
  });

  it("keeps playing and following the session with no screen involved (acceptance 1)", async () => {
    const f = fake();
    await f.np.play(job("m1"));
    f.opens[0].o.onState(st(2));
    expect(f.np.state()).toMatchObject({ status: "playing", index: 2, title: "Tm12", position: 3 });
    f.opens[0].o.onState(st(2, { playing: false }));
    expect(f.np.state().status).toBe("paused");
    expect(f.opens[0].stop).not.toHaveBeenCalled();
  });

  it("shows the bar while playing or paused, and not before or after Stop (acceptance 2)", async () => {
    const f = fake();
    expect(showsBar(f.np.state())).toBe(false);
    const starting = f.np.play(job("m1"));
    expect(showsBar(f.np.state())).toBe(false);
    await starting;
    expect(showsBar(f.np.state())).toBe(true);
    f.opens[0].o.onState(st(0, { playing: false }));
    expect(showsBar(f.np.state())).toBe(true);
    f.np.stop();
    expect(showsBar(f.np.state())).toBe(false);
    expect(f.opens[0].stop).toHaveBeenCalledTimes(1);
  });

  it("starting a second job stops the first, so two never play, and ignores the first's late reports (acceptance 3)", async () => {
    const f = fake();
    await f.np.play(job("m1"));
    await f.np.play(job("m2"));
    expect(f.opens[0].stop).toHaveBeenCalledTimes(1);
    expect(f.np.state()).toMatchObject({ id: "m2", status: "playing" });
    f.opens[0].o.onState(st(1));
    f.opens[0].o.onState(st(1, { ended: true }));
    expect(f.np.state()).toMatchObject({ id: "m2", status: "playing", index: 0 });
  });

  it("goes quiet, with no note, when another session replaces it", async () => {
    const f = fake();
    await f.np.play(job("m1"));
    f.opens[0].o.onState({ playing: false, index: 0, ended: true, replaced: true });
    expect(f.np.state()).toMatchObject({ status: "idle", id: "", note: "" });
  });

  it("says Finished when a non-looping session ends, keeping which job it was", async () => {
    const f = fake();
    await f.np.play(job("m1"));
    f.opens[0].o.onState({ playing: false, index: 2, ended: true });
    expect(f.np.state()).toMatchObject({ status: "idle", id: "m1", note: "Finished." });
  });

  it("stops with a note when a clip cannot be played, and can start again", async () => {
    const f = fake();
    await f.np.play(job("m1"));
    f.opens[0].o.onState({ playing: false, index: 0, ended: false, failed: true });
    expect(f.opens[0].stop).toHaveBeenCalled();
    expect(f.np.state()).toMatchObject({ status: "idle", note: "This recording could not be played." });
    await f.np.play(job("m1"));
    expect(f.opens).toHaveLength(2);
  });

  it("pauses and resumes the session", async () => {
    const f = fake();
    await f.np.play(job("m1"));
    f.np.toggle();
    expect(f.opens[0].pause).toHaveBeenCalledTimes(1);
    f.opens[0].o.onState(st(0, { playing: false }));
    f.np.toggle();
    expect(f.opens[0].play).toHaveBeenCalledTimes(2);
  });

  it("stop(id) only stops that job", async () => {
    const f = fake();
    await f.np.play(job("m1"));
    f.np.stop("all");
    expect(f.np.state().status).toBe("playing");
    f.np.stop("m1");
    expect(f.np.state().status).toBe("idle");
  });

  it("opens nothing, with the job's message, when there is nothing to play", async () => {
    const f = fake();
    await f.np.play(job("all", { prepare: async () => null }));
    expect(f.opens).toHaveLength(0);
    expect(f.np.state()).toMatchObject({ status: "idle", id: "all", note: "Nothing here." });
  });

  it("a session that opens while this one is preparing wins; this one does not start over it", async () => {
    const f = fake();
    let release: (p: Prepared) => void = () => undefined;
    const starting = f.np.play(job("m1", { prepare: () => new Promise((r) => (release = r)) }));
    await new Promise((r) => setTimeout(r, 0));
    f.otherOpens();
    release((await job("m2").prepare())!);
    await starting;
    expect(f.opens).toHaveLength(0);
    expect(f.np.state().status).toBe("idle");
  });

  it("opens nothing when stopped while preparing, and says so when preparing fails", async () => {
    const f = fake();
    const starting = f.np.play(job("m1"));
    f.np.stop();
    await starting;
    expect(f.opens).toHaveLength(0);
    await f.np.play(job("m1", { prepare: async () => Promise.reject(new Error("disk")) }));
    expect(f.np.state()).toMatchObject({ status: "idle", note: "Could not start playing." });
    await f.np.play(job("m1"));
    expect(f.opens).toHaveLength(1);
  });
});

describe("Play all on loop, as a job (#157)", () => {
  const saved: string[] = [];
  const make = (load: () => Promise<typeof items>) => makePlayAll({ save: async (name) => (saved.push(name), `file:${name}`), load });
  beforeEach(() => void (saved.length = 0));

  it("is every recording once in the Library's order, a gap after each, looping, with its own gap clip name", async () => {
    const p = await make(async () => items).job.prepare();
    const gap = `file:${PLAYLIST_GAP_NAME}`;
    expect(p?.clips).toEqual(["c.wav", gap, "b.wav", gap, "a.wav", gap]);
    expect(p?.loop).toBe(true);
    expect(saved).toEqual([PLAYLIST_GAP_NAME]);
    expect([false, true].flatMap((l) => [false, true].map((b) => playerGapName(l, b)))).not.toContain(PLAYLIST_GAP_NAME);
    expect(LOOP_GAP_MS).toBeLessThanOrEqual(1800);
  });

  it("follows the session to the recording playing; a gap shows the one before it, and the wrap returns to the first", async () => {
    const p = await make(async () => items).job.prepare();
    expect([0, 1, 2, 3, 4, 5, 0].map((i) => p?.at(i).title)).toEqual(["Calm", "Calm", "Brave", "Brave", "Awake", "Awake", "Calm"]);
    expect(p?.at(2)).toEqual({ title: "Brave", position: 2, total: 3 });
  });

  it("has nothing to play for an empty Library, copies once until reset, and retries after a failed read", async () => {
    const empty = make(async () => []);
    expect(await empty.job.prepare()).toBeNull();
    let loads = 0;
    let fail = true;
    const p = make(async () => (loads++, fail ? Promise.reject(new Error("disk")) : items));
    await expect(p.prepare()).rejects.toThrow();
    fail = false;
    await p.prepare();
    await p.prepare();
    expect(loads).toBe(2);
    p.reset();
    await p.prepare();
    expect(loads).toBe(3);
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
