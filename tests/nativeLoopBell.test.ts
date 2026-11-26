// #177: a soft bell between recordings when looping the Library or a Create recording.
// The choice is stored, the gap clip carries the bell only when it is on, and the file name differs with it.
import { describe, expect, it, vi } from "vitest";
import { gapClip } from "@/lib/playerQueue";
import {
  BELL_KEY, DEFAULT_BELL, LOOP_GAP_MS, PLAYLIST_GAP_NAME, createGapName, makeBellStore, parseBell, playerGapName, playlistGapName,
} from "@/native/src/player/loop";
import { makePlayAll } from "@/native/src/player/playAll";
import type { KV } from "@/native/src/seams/kv.types";

const h = vi.hoisted(() => ({ saved: [] as Array<{ name: string; bytes: Uint8Array }> }));
vi.mock("@/native/src/seams/audio", () => ({
  audio: {
    configure: async () => undefined,
    save: async (name: string, bytes: Uint8Array) => (h.saved.push({ name, bytes }), `file:${name}`),
    open: (srcs: string[]) => ({ srcs, play: () => undefined, stop: () => undefined }),
  },
}));
import { play } from "@/native/src/create/playback";

const memory = (seed: Record<string, string> = {}, refuse = false): KV & { data: Record<string, string> } => {
  const data = { ...seed };
  return {
    data,
    get: async (k) => data[k] ?? null,
    set: async (k, v) => (refuse ? false : ((data[k] = v), true)),
    remove: async (k) => void delete data[k],
  };
};
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

describe("the stored bell choice", () => {
  it("is On until changed, is kept, and reads back after a restart", async () => {
    const kv = memory();
    expect(DEFAULT_BELL).toBe(true);
    expect(await makeBellStore(kv).read()).toBe(true);
    expect(await makeBellStore(kv).write(false)).toBe(true);
    expect(kv.data[BELL_KEY]).toBe("off");
    expect(await makeBellStore(kv).read()).toBe(false);
    await makeBellStore(kv).write(true);
    expect(await makeBellStore(kv).read()).toBe(true);
  });

  it("reads anything unknown as On, and a refused write is false, not a throw", async () => {
    expect(parseBell("maybe")).toBe(true);
    expect(parseBell(null)).toBe(true);
    expect(await makeBellStore(memory({ [BELL_KEY]: "off" })).read()).toBe(false);
    expect(await makeBellStore(memory({}, true)).write(false)).toBe(false);
  });
});

describe("the file names", () => {
  it("differ with the bell, so one clip never replaces the other", () => {
    expect(playlistGapName(false)).toBe(PLAYLIST_GAP_NAME);
    expect(playlistGapName(true)).not.toBe(playlistGapName(false));
    expect(createGapName(true)).not.toBe(createGapName(false));
    const all = [playlistGapName(true), playlistGapName(false), createGapName(true), createGapName(false), playerGapName(true, true), playerGapName(false, true), playerGapName(true, false), playerGapName(false, false)];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("the Library loop's gap clip (acceptance 1 and 2)", () => {
  const items = [{ id: "a", src: "a.wav", title: "A" }, { id: "b", src: "b.wav", title: "B" }];
  const build = async (bell: boolean) => {
    h.saved.length = 0;
    const saved: typeof h.saved = [];
    const pa = makePlayAll({
      save: async (name, bytes) => (saved.push({ name, bytes }), `file:${name}`),
      load: async () => items,
      bell: async () => bell,
    });
    const p = await pa.prepare();
    return { p, saved };
  };

  it("holds the bell when it is on, and plays it after every recording, the last included", async () => {
    const { p, saved } = await build(true);
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe(playlistGapName(true));
    expect(same(saved[0].bytes, gapClip(true, LOOP_GAP_MS))).toBe(true);
    expect(p?.clips).toEqual(["a.wav", `file:${playlistGapName(true)}`, "b.wav", `file:${playlistGapName(true)}`]);
    expect(p?.loop).toBe(true);
  });

  it("is silence when the bell is off", async () => {
    const { saved } = await build(false);
    expect(saved[0].name).toBe(playlistGapName(false));
    expect(same(saved[0].bytes, gapClip(false, LOOP_GAP_MS))).toBe(true);
    expect(same(gapClip(true, LOOP_GAP_MS), gapClip(false, LOOP_GAP_MS))).toBe(false);
  });

  it("is rebuilt with the new choice after a reset", async () => {
    let bell = true;
    const saved: string[] = [];
    const pa = makePlayAll({ save: async (n) => (saved.push(n), n), load: async () => items, bell: async () => bell });
    await pa.prepare();
    bell = false;
    pa.reset();
    await pa.prepare();
    expect(saved).toEqual([playlistGapName(true), playlistGapName(false)]);
  });
});

describe("the Create recording loop (the bell beside its loop toggle)", () => {
  const made = { title: "T", lines: ["x"], recording: { audio: new ArrayBuffer(4), mime: "audio/wav", starts: [0] } } as never;
  const ev = { onLine: () => undefined, onEnd: () => undefined, onError: () => undefined, onPlaying: () => undefined };
  const run = async (opts: Parameters<typeof play>[2]) => {
    h.saved.length = 0;
    const p = play(made, ev, opts);
    await new Promise((r) => setTimeout(r, 0));
    p.stop();
    return h.saved.filter((s) => s.name.startsWith("create-gap"));
  };

  it("saves the bell in the gap when looping with the bell on", async () => {
    const [g, ...rest] = await run({ loop: true, bell: true });
    expect(rest).toHaveLength(0);
    expect(g.name).toBe(createGapName(true));
    expect(same(g.bytes, gapClip(true, LOOP_GAP_MS))).toBe(true);
  });

  it("saves silence with the bell off, and no bell when not looping", async () => {
    const [g] = await run({ loop: true, bell: false });
    expect(g.name).toBe(createGapName(false));
    expect(same(g.bytes, gapClip(false, LOOP_GAP_MS))).toBe(true);
    expect(await run({ loop: false, bell: true })).toHaveLength(0);
  });
});
