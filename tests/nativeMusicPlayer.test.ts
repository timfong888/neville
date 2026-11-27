// #184: only one background music player ever runs. One module owns it; a change stops and unloads the
// current player first; a load that finishes after a later choice never plays.
import { describe, expect, it, vi } from "vitest";
import { type MusicEngine, type MusicHandle, type Track, makeMusicPlayer } from "@/native/src/player/musicPlayer";

type Fn = ReturnType<typeof vi.fn>;
type Fake = MusicHandle & { id: string; volume: number; play: Fn; pause: Fn; remove: Fn; setVolume: Fn; fade: Fn; removed: boolean };

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
          fade: vi.fn(),
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

// #208: Play all with music → single item still plays two tracks.
// Root cause: close() resets session=0, next attach() increments back to 1 — the same mine
// value as the closed session. Stale voice/close calls from the old follower pass the guard.
describe("double-attach / stale-follower safety (#208)", () => {
  // Helper: max live handles ever observed across the whole test.
  function maxAlive(r: ReturnType<typeof rig>, steps: () => Promise<void>): Promise<number> {
    let peak = 0;
    const orig = r.engine.load;
    (r.engine as { load: typeof orig }).load = async (src, vol) => {
      const h = await orig(src, vol);
      return h;
    };
    return steps().then(() => {
      peak = r.alive().length;
      return peak;
    });
  }
  void maxAlive; // used only conceptually above; tests use r.alive() inline.

  it("attach1 → close1 → attach2: stale close from session 1 does not remove session 2's player", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    p.setTarget(A);

    const first = p.attach();
    first.voice(true);
    await r.finish(0);
    expect(r.alive()).toHaveLength(1);

    // Session 1 closes normally (as in nowPlaying.end())
    first.close();
    expect(r.alive()).toHaveLength(0);

    // Session 2 attaches (new play request)
    const second = p.attach();
    second.voice(true);
    await r.finish(1);
    expect(r.alive()).toHaveLength(1);

    // Stale close() from session 1 arrives (async event from expo-audio after the subscription
    // was removed — possible in RN if a native event was already queued in the bridge)
    first.close();
    // Must NOT remove session 2's player
    expect(r.alive()).toHaveLength(1);
    expect(r.alive()[0].id).toBe("a.mp3");
  });

  it("attach1 → close1 → attach2: stale voice() from session 1 does not pause session 2's player", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    p.setTarget(A);

    const first = p.attach();
    first.voice(true);
    await r.finish(0);

    first.close();

    const second = p.attach();
    // Stale voice(false) from session 1 arrives (old playlist emitting a pause event)
    first.voice(false);

    second.voice(true);
    await r.finish(1);

    // Session 2's music must be playing
    expect(r.made[1].play).toHaveBeenCalled();
    expect(r.alive()).toHaveLength(1);
  });

  it("while first load is still pending, close then new attach: stale close still cannot remove the new player", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    p.setTarget(A);

    const first = p.attach();
    first.voice(true);
    // Load is pending — do NOT finish it yet

    // Session 1 closes while load is in flight
    first.close();
    // Pending load must have been voided
    await r.finish(0);
    expect(r.made[0].removed).toBe(true);

    // Session 2 attaches
    const second = p.attach();
    second.voice(true);
    await r.finish(1);
    expect(r.alive()).toHaveLength(1);

    // Stale close from session 1
    first.close();
    expect(r.alive()).toHaveLength(1);
  });

  it("pause then switch: pausing session 1 and switching to session 2 leaves exactly one player", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    p.setTarget(A);

    const first = p.attach();
    first.voice(true);
    await r.finish(0);
    first.voice(false); // pause
    expect(r.made[0].pause).toHaveBeenCalledTimes(1);

    first.close(); // switch away
    expect(r.alive()).toHaveLength(0);

    const second = p.attach();
    second.voice(true);
    await r.finish(1);
    expect(r.alive()).toHaveLength(1);

    // Stale close and voice from session 1
    first.close();
    first.voice(false);
    expect(r.alive()).toHaveLength(1);
  });

  it("music Off then On mid-play does not create a second player", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    const f = p.attach();
    f.voice(true);
    p.setTarget(A);
    await r.finish(0);
    expect(r.alive()).toHaveLength(1);

    p.setTarget(undefined); // Off
    expect(r.alive()).toHaveLength(0);

    p.setTarget(A); // On again
    await r.finish(1);
    expect(r.alive()).toHaveLength(1);
    expect(r.made[0].removed).toBe(true);
  });

  it("load resolves after close+reattach: the stale load is dropped and only the new one plays", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    p.setTarget(A);

    const first = p.attach();
    first.voice(true);
    // Load 0 (A) is pending

    first.close(); // closes before load finishes

    const second = p.attach();
    second.voice(true);
    // Load 1 (A again, new token) is pending

    // Old load resolves first; `rig()` pushes the fake into `made` at call time, so
    // alive() = 1 here (handle1 pending), but the stale handle0 must be dropped.
    await r.finish(0); // stale — must be dropped
    expect(r.made[0].removed).toBe(true);
    expect(r.made).toHaveLength(2); // both loads were started

    await r.finish(1); // new load resolves
    expect(r.alive()).toHaveLength(1);
    expect(r.alive()[0].id).toBe("a.mp3");
    expect(r.made[1].play).toHaveBeenCalled();
    expect(r.made[0].play).not.toHaveBeenCalled();
  });

  it("rapid double switch: attach1 → close1 → attach2 → close2 → attach3 leaves one player", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    p.setTarget(A);

    const first = p.attach();
    first.voice(true);
    await r.finish(0);

    first.close();
    const second = p.attach();
    second.voice(true);
    await r.finish(1);

    second.close();
    const third = p.attach();
    third.voice(true);
    await r.finish(2);
    expect(r.alive()).toHaveLength(1);

    // All stale closers must be no-ops
    first.close();
    second.close();
    expect(r.alive()).toHaveLength(1);
  });

  it("old session's ended report arriving after new attach does not stop the new session's music", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    p.setTarget(A);

    const first = p.attach();
    first.voice(true);
    await r.finish(0);

    first.close();
    const second = p.attach();
    second.voice(true);
    await r.finish(1);

    // nowPlaying fires the old session's onState(ended=true, replaced=true), which may call bed.voice(false)
    // then bed.close() on the stale follower
    first.voice(false); // stale voice-off (session ended)
    first.close();      // stale close (session's onState → end() → stop() → close())

    expect(r.alive()).toHaveLength(1);
    expect(r.made[1].pause).not.toHaveBeenCalled();
  });

  it("logs a warning when attach finds a live player from a previous session", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    p.setTarget(A);

    // Session 1 attaches and starts loading — no close before session 2
    p.attach();
    // Session 2 attaches without session 1 having closed (simulates audio.open replacing a session
    // that nowPlaying.end() hadn't stopped yet, via current?.() path in audio.open)
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    p.attach();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[music_double_attach]"), expect.anything());
    warn.mockRestore();
  });
});

// #236: natural-end fade → immediate new session must not leave two music beds playing.
// Root cause: fade() cleared `loaded` without tracking the fading handle, so release() on
// the next attach() had nothing to cancel and the old bed kept fading while the new one loaded.
describe("natural-end fade safety (#236)", () => {
  it("starting a new session while the previous one is fading cancels the fade", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    p.setTarget(A);

    const first = p.attach();
    first.voice(true);
    await r.finish(0);
    expect(r.alive()).toHaveLength(1);

    // Natural session end: fade the music over 5 seconds
    first.fade(5);
    expect((r.made[0] as Fake).fade).toHaveBeenCalledWith(5);
    // The player is detached immediately so observers see no active session
    expect(p.view().active).toBe(false);
    // But remove() must NOT have been called yet — fade is in progress
    expect(r.made[0].remove).not.toHaveBeenCalled();

    // A new session starts before the fade completes
    const second = p.attach();
    // release() inside attach() must cancel the in-progress fade
    expect(r.made[0].remove).toHaveBeenCalledTimes(1);

    second.voice(true);
    await r.finish(1);
    // Only the new session's player is alive — no overlap
    expect(r.alive()).toHaveLength(1);
    expect(r.alive()[0].id).toBe("a.mp3");
  });

  it("fade completing naturally before the next session does not break the next attach", async () => {
    const r = rig();
    const p = makeMusicPlayer(r.engine);
    p.setTarget(A);

    const first = p.attach();
    first.voice(true);
    await r.finish(0);

    first.fade(5);
    // Simulate the native platform completing the fade and calling remove internally
    r.made[0].remove();

    // Now a new session starts — should work normally with no double-remove errors
    const second = p.attach();
    second.voice(true);
    await r.finish(1);
    expect(r.alive()).toHaveLength(1);
    expect(r.alive()[0].id).toBe("a.mp3");
  });
});
