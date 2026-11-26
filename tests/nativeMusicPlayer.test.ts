// #184: only one background music player ever runs. One module owns it; a change stops and unloads the
// current player first; a load that finishes after a later choice never plays.
import { describe, expect, it, vi } from "vitest";
import { type MusicEngine, type MusicHandle, type Track, makeMusicPlayer } from "@/native/src/player/musicPlayer";

type Fn = ReturnType<typeof vi.fn>;
type Fake = MusicHandle & { id: string; volume: number; play: Fn; pause: Fn; remove: Fn; setVolume: Fn; removed: boolean };

/** An engine whose loads finish when the test says so, and which can see every player it ever made. */
function rig() {
  const made: Fake[] = [];
  const waiting: Array<{ fake: Fake; ok(): void; fail(): void }> = [];
  const engine: MusicEngine = {
    load: (src, volume) =>
      new Promise<MusicHandle>((resolve, reject) => {
        const fake: Fake = {
          id: String(src),
          volume,
          removed: false,
          play: vi.fn(),
          pause: vi.fn(),
          setVolume: vi.fn((v: number) => void (fake.volume = v)),
          remove: vi.fn(() => void (fake.removed = true)),
        };
        made.push(fake);
        waiting.push({ fake, ok: () => resolve(fake), fail: () => ((fake.removed = true), reject(new Error("load"))) });
      }),
  };
  const finish = async (n: number) => {
    waiting[n].ok();
    await Promise.resolve();
    await Promise.resolve();
  };
  /** Players that exist and are not removed: more than one is the bug. */
  const alive = () => made.filter((m) => !m.removed);
  /** Players that ever made a sound. */
  const sounded = () => made.filter((m) => m.play.mock.calls.length > 0);
  return { engine, made, waiting, finish, alive, sounded };
}

const A: Track = { id: "night-tide", src: "a.mp3", volume: 0.3 };
const B: Track = { id: "rise", src: "b.mp3", volume: 0.3 };
const flush = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

describe("one music player at a time (#184)", () => {
  it("plays the chosen track under a session, once the voice plays", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    const f = p.attach();
    p.setTarget(A);
    await r.finish(0);
    expect(r.alive()).toHaveLength(1);
    expect(r.made[0].play).not.toHaveBeenCalled();
    f.voice(true);
    expect(r.made[0].play).toHaveBeenCalledTimes(1);
  });

  it("makes no player without a session, or without a choice", async () => {
    const r = rig();
    makeMusicPlayer(r.engine).setTarget(A);
    expect(r.made).toHaveLength(0);
    const q = makeMusicPlayer(r.engine);
    q.attach();
    q.setTarget(undefined);
    expect(r.made).toHaveLength(0);
  });

  it("A to B: the first is stopped and unloaded before the second starts", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    const f = p.attach();
    f.voice(true);
    p.setTarget(A);
    await r.finish(0);
    p.setTarget(B);
    // Gone at the tap, not when the next one has loaded.
    expect(r.made[0].remove).toHaveBeenCalledTimes(1);
    expect(r.alive()).toHaveLength(1);
    await r.finish(1);
    expect(r.alive().map((m) => m.id)).toEqual(["b.mp3"]);
    expect(r.made[1].play).toHaveBeenCalledTimes(1);
    expect(r.sounded()).toHaveLength(2);
  });

  it("Off stops and unloads, not mutes or pauses", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    const f = p.attach();
    f.voice(true);
    p.setTarget(A);
    await r.finish(0);
    p.setTarget(undefined);
    expect(r.made[0].remove).toHaveBeenCalledTimes(1);
    expect(r.alive()).toHaveLength(0);
    expect(p.view()).toEqual({ choice: "none", active: true });
  });

  it("rapid A, B, Off ends with nothing, whatever order the loads finish in", async () => {
    for (const order of [[0, 1], [1, 0]]) {
      const r = rig();
      const p = makeMusicPlayer(r.engine);
      const f = p.attach();
      f.voice(true);
      p.setTarget(A);
      p.setTarget(B);
      p.setTarget(undefined);
      for (const n of order) await r.finish(n);
      expect(r.alive()).toHaveLength(0);
      expect(r.sounded()).toHaveLength(0);
      expect(p.view().choice).toBe("none");
    }
  });

  it("rapid A, B ends with B only", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    const f = p.attach();
    f.voice(true);
    p.setTarget(A);
    p.setTarget(B);
    await r.finish(1);
    await r.finish(0);
    expect(r.alive().map((m) => m.id)).toEqual(["b.mp3"]);
    expect(r.sounded().map((m) => m.id)).toEqual(["b.mp3"]);
  });

  it("a load that finishes after Off is released and never plays", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    const f = p.attach();
    f.voice(true);
    p.setTarget(A);
    p.setTarget(undefined);
    await r.finish(0);
    expect(r.made[0].remove).toHaveBeenCalledTimes(1);
    expect(r.made[0].play).not.toHaveBeenCalled();
  });

  it("a load that finishes after the session closed is released and never plays", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    const f = p.attach();
    f.voice(true);
    p.setTarget(A);
    f.close();
    await r.finish(0);
    expect(r.made[0].remove).toHaveBeenCalledTimes(1);
    expect(r.made[0].play).not.toHaveBeenCalled();
  });

  it("leaving (the session ends) removes the player, and a later choice makes no new one", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    const f = p.attach();
    f.voice(true);
    p.setTarget(A);
    await r.finish(0);
    f.close();
    expect(r.alive()).toHaveLength(0);
    p.setTarget(B);
    expect(r.made).toHaveLength(1);
    expect(p.view()).toEqual({ choice: "none", active: false });
  });

  it("the same track at a new volume is turned up or down, not loaded again", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    p.attach().voice(true);
    p.setTarget(A);
    await r.finish(0);
    p.setTarget({ ...A, volume: 0.1 });
    p.setTarget({ ...A, volume: 0.1 });
    expect(r.made).toHaveLength(1);
    expect(r.made[0].volume).toBe(0.1);
  });

  it("a volume change while the track is still loading is what it plays at", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    p.attach().voice(true);
    p.setTarget(A);
    p.setTarget({ ...A, volume: 0.05 });
    await r.finish(0);
    expect(r.made).toHaveLength(1);
    expect(r.made[0].volume).toBe(0.05);
  });

  it("follows the voice: paused with it, and a load that finishes while it is paused waits", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    const f = p.attach();
    p.setTarget(A);
    f.voice(false);
    await r.finish(0);
    expect(r.made[0].play).not.toHaveBeenCalled();
    f.voice(true);
    expect(r.made[0].play).toHaveBeenCalledTimes(1);
    f.voice(false);
    expect(r.made[0].pause).toHaveBeenCalledTimes(1);
    f.voice(false);
    expect(r.made[0].pause).toHaveBeenCalledTimes(1);
  });

  it("a track chosen while paused plays on the voice's next Play", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    const f = p.attach();
    f.voice(true);
    p.setTarget(A);
    await r.finish(0);
    f.voice(false);
    p.setTarget(B);
    await r.finish(1);
    expect(r.made[1].play).not.toHaveBeenCalled();
    f.voice(true);
    expect(r.made[1].play).toHaveBeenCalledTimes(1);
    expect(r.alive()).toHaveLength(1);
  });

  it("a new session replaces the old: the old one's calls do nothing, and one player exists", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    p.setTarget(A);
    const first = p.attach();
    first.voice(true);
    await r.finish(0);
    const second = p.attach();
    // The old player is gone at once; the new session loads its own.
    expect(r.made[0].removed).toBe(true);
    first.voice(true);
    first.close();
    expect(r.made).toHaveLength(2);
    second.voice(true);
    await r.finish(1);
    expect(r.alive()).toHaveLength(1);
    // The old session closing late must not take the new one's music with it.
    first.close();
    expect(r.alive()).toHaveLength(1);
  });

  it("a track that cannot load leaves Off showing, and the next choice still works", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    p.attach().voice(true);
    p.setTarget(A);
    expect(p.view().choice).toBe("night-tide");
    r.waiting[0].fail();
    await flush();
    expect(p.view().choice).toBe("none");
    p.setTarget(B);
    await r.finish(1);
    expect(p.view().choice).toBe("rise");
    expect(r.alive()).toHaveLength(1);
  });

  it("shows the track that is loading or playing, not the saved choice, and tells subscribers", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    const seen = vi.fn();
    const off = p.subscribe(seen);
    const f = p.attach();
    expect(p.view()).toEqual({ choice: "none", active: true });
    p.setTarget(A);
    expect(p.view().choice).toBe("night-tide");
    await r.finish(0);
    p.setTarget(undefined);
    expect(p.view().choice).toBe("none");
    expect(seen).toHaveBeenCalled();
    const n = seen.mock.calls.length;
    off();
    f.close();
    expect(seen.mock.calls.length).toBe(n);
  });

  it("view is the same object until something changes, so a screen does not redraw for nothing", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    p.attach();
    const v = p.view();
    p.setTarget(undefined);
    expect(p.view()).toBe(v);
  });
});
