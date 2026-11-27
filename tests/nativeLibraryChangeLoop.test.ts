// #237: deleting a recording while Play all runs should rebuild and continue, not stop.
// Tests use the same audio-seam fake as nativePlaylistLoop.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Manifestation } from "@/lib/library/model";
import { makeNowPlaying } from "@/native/src/player/nowPlaying";
import { makePlayAll } from "@/native/src/player/playAll";
import { makeMusicPlayer } from "@/native/src/player/musicPlayer";
import type { MusicEngine, MusicHandle } from "@/native/src/player/musicPlayer";
import type { PlayState } from "@/native/src/seams/types";

// ─── library/audio seam fakes ────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  manifestations: [] as unknown[],
  uris: {} as Record<string, string | null>,
  kept: [] as string[],
}));
vi.mock("@/native/src/seams/library", () => ({
  library: {
    load: async () => ({ manifestations: h.manifestations }),
    audioUri: async (id: string) => h.uris[id] ?? null,
  },
}));
vi.mock("@/native/src/seams/audio", () => ({
  audio: { keep: async (name: string, src: string) => (h.kept.push(name), `kept:${src}`) },
}));

// ─── helpers ─────────────────────────────────────────────────────────────────

type FakeSession = { srcs: string[]; o: { title: string; loop?: boolean; onState(s: PlayState): void }; play: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };

function fakeAudio() {
  const opens: FakeSession[] = [];
  let count = 0;
  return {
    audio: {
      configure: async () => undefined,
      opened: () => count,
      open: (srcs: string[], o: FakeSession["o"]) => {
        count++;
        const s: FakeSession = { srcs, o, play: vi.fn(), stop: vi.fn() };
        opens.push(s);
        return s;
      },
    },
    opens,
  };
}

function makeItem(id: string, hasAudio = true, createdAt = Date.now()): Manifestation {
  return { id, title: `T-${id}`, hasAudio, createdAt, updatedAt: createdAt, lines: [], voiceName: "", voiceId: "", want: "", firstName: "" };
}

function setup(items: { id: string }[]) {
  h.kept.length = 0;
  h.manifestations = items.map((i) => makeItem(i.id));
  h.uris = Object.fromEntries(items.map((i) => [i.id, `uri-${i.id}`]));
  const { audio, opens } = fakeAudio();
  const np = makeNowPlaying(audio);
  const pa = makePlayAll({
    save: async (name) => `file:${name}`,
    load: (gone) => import("@/native/src/player/copies").then((m) => m.libraryRecordings(gone)),
    bell: async () => false,
  });
  return { np, pa, opens };
}

// Simulates what nowPlayingStore.ts does on library.subscribe (#237 fix).
function handleLibraryChange(np: ReturnType<typeof makeNowPlaying>, pa: ReturnType<typeof makePlayAll>) {
  const { id, status, index } = np.state();
  pa.reset();
  if (id === "all" && (status === "playing" || status === "paused")) {
    const currentId = pa.idAtClipIndex(index) ?? null;
    return np.play(pa.jobFrom(currentId));
  } else if (id !== "all") {
    np.stop();
  }
  return Promise.resolve();
}

// ─── jobFrom: queue-rebuild logic ────────────────────────────────────────────

describe("playAll.jobFrom: queue-rebuild after library change", () => {
  const items = [
    { id: "a", src: "a.wav", title: "A" },
    { id: "b", src: "b.wav", title: "B" },
    { id: "c", src: "c.wav", title: "C" },
  ];
  const makePA = (load: () => typeof items) =>
    makePlayAll({ save: async (n) => `file:${n}`, load: async () => load(), bell: async () => false });

  it("continues from the item after the playing one when it still exists", async () => {
    const pa = makePA(() => items);
    await pa.prepare(); // build; lastQueueItems = [a, b, c]
    // Simulate: b is playing (clip index 2 = item index 1 = b)
    expect(pa.idAtClipIndex(2)).toBe("b");
    // After library change, library still has [a, b, c]. prevPlayingId = "b" → starts from c.
    const p = await pa.jobFrom("b").prepare();
    expect(p?.clips[0]).toBe("c.wav"); // starts from c
    expect(p?.clips).toContain("a.wav");
    expect(p?.clips).toContain("b.wav");
  });

  it("starts from the first item when the playing item was deleted", async () => {
    const pa = makePA(() => items);
    await pa.prepare();
    // Library now has only [a, c] (b was deleted); prevPlayingId = "b" → not found → starts from a.
    const reduced = makePlayAll({ save: async (n) => `file:${n}`, load: async () => items.filter((i) => i.id !== "b"), bell: async () => false });
    pa.reset();
    const p = await reduced.jobFrom("b").prepare();
    expect(p?.clips[0]).toBe("a.wav");
  });

  it("returns null and shows the library-change note when nothing remains", async () => {
    const pa = makePA(() => []);
    const p = await pa.jobFrom("b").prepare();
    expect(p).toBeNull();
    expect(pa.jobFrom("b").empty).toBe("Playback stopped because your library changed.");
  });

  it("wraps to the first item when the playing one is last", async () => {
    const pa = makePA(() => items);
    await pa.prepare();
    // c is last (index 2); next wraps to a.
    const p = await pa.jobFrom("c").prepare();
    expect(p?.clips[0]).toBe("a.wav");
  });

  it("idAtClipIndex maps gap clips to the same item as the voice clip before them", async () => {
    const pa = makePA(() => items);
    await pa.prepare();
    expect(pa.idAtClipIndex(0)).toBe("a"); // voice clip of a
    expect(pa.idAtClipIndex(1)).toBe("a"); // gap after a → still "a"
    expect(pa.idAtClipIndex(2)).toBe("b");
    expect(pa.idAtClipIndex(4)).toBe("c");
  });
});

// ─── integration: nowPlaying + playAll on library change ────────────────────

describe("library change during Play all (reproduces issue #237)", () => {
  beforeEach(() => { h.kept.length = 0; });

  it("FAIL on main: delete a later item — music keeps playing with no voice when the voice stops on library change", async () => {
    // On main, library.subscribe calls nowPlaying.stop(); the voice session ends, leaving music
    // playing. This test verifies the new behaviour: a new session starts instead.
    const { np, pa, opens } = setup([{ id: "a" }, { id: "b" }, { id: "c" }]);
    await np.play(pa.job);
    expect(opens).toHaveLength(1);

    // Simulate: session is playing item b (clip index 2).
    opens[0].o.onState({ playing: true, index: 2, ended: false });
    expect(np.state().status).toBe("playing");

    // Library changes: c is deleted. Update h.manifestations to reflect.
    h.manifestations = [makeItem("a"), makeItem("b")];
    h.uris = { a: "uri-a", b: "uri-b" };
    await handleLibraryChange(np, pa);

    // A new session must have been opened (not just stopped).
    expect(opens.length).toBeGreaterThan(1);
    expect(np.state().status).not.toBe("idle");
  });

  it("FAIL on main: delete the playing item — voice stops, no note; new session should start from first remaining", async () => {
    const { np, pa, opens } = setup([{ id: "a" }, { id: "b" }, { id: "c" }]);
    await np.play(pa.job);
    opens[0].o.onState({ playing: true, index: 2, ended: false }); // b is playing

    // Library changes: b is deleted.
    h.manifestations = [makeItem("a"), makeItem("c")];
    h.uris = { a: "uri-a", c: "uri-c" };
    await handleLibraryChange(np, pa);

    // New session started (b not found → start from a).
    expect(opens.length).toBeGreaterThan(1);
    // First clip of new session should be "a" (kept:uri-a).
    const newSrcs = opens.at(-1)!.srcs;
    expect(newSrcs[0]).toContain("a");
  });

  it("FAIL on main: delete all items — session should stop with a note", async () => {
    const { np, pa, opens } = setup([{ id: "a" }, { id: "b" }]);
    await np.play(pa.job);
    opens[0].o.onState({ playing: true, index: 0, ended: false });

    // Library changes: all deleted.
    h.manifestations = [];
    h.uris = {};
    await handleLibraryChange(np, pa);

    expect(np.state().status).toBe("idle");
    expect(np.state().note).toBe("Playback stopped because your library changed.");
  });

  it("FAIL on main: library change during the gap (odd clip index) — rebuild continues", async () => {
    const { np, pa, opens } = setup([{ id: "a" }, { id: "b" }, { id: "c" }]);
    await np.play(pa.job);
    // Gap clip after a is index 1 (odd).
    opens[0].o.onState({ playing: true, index: 1, ended: false });
    expect(pa.idAtClipIndex(1)).toBe("a"); // gap maps back to "a"

    h.manifestations = [makeItem("a"), makeItem("b")]; // c deleted
    h.uris = { a: "uri-a", b: "uri-b" };
    await handleLibraryChange(np, pa);

    // A new session was opened (not just stopped).
    expect(opens.length).toBeGreaterThan(1);
  });
});

// ─── music never outlives the voice session (#237 req 4) ────────────────────

describe("music never outlives the voice session", () => {
  it("after follower.close() the music player has no live handle and active is false", async () => {
    let resolveLoad!: (h: MusicHandle) => void;
    const mockHandle: MusicHandle = { play: vi.fn(), pause: vi.fn(), setVolume: vi.fn(), remove: vi.fn() };
    const engine: MusicEngine = { load: () => new Promise((r) => { resolveLoad = r; }) };
    const player = makeMusicPlayer(engine);

    player.setTarget({ id: "rise" as never, src: "rise.mp3", volume: 0.5 });
    const follower = player.attach();
    resolveLoad(mockHandle);
    await new Promise((r) => setTimeout(r, 0)); // let load settle

    expect(player.view().active).toBe(true);
    follower.close();

    expect(player.view().active).toBe(false);
    expect(player.view().choice).toBe("none");
    expect(mockHandle.remove).toHaveBeenCalledTimes(1);
  });

  it("a stale follower from a replaced session cannot call close on the new session", () => {
    const engine: MusicEngine = { load: () => new Promise(() => undefined) };
    const player = makeMusicPlayer(engine);
    player.setTarget({ id: "rise" as never, src: "rise.mp3", volume: 0.5 });

    const first = player.attach();
    const second = player.attach(); // replaces first
    expect(player.view().active).toBe(true);

    first.close(); // stale — should do nothing
    expect(player.view().active).toBe(true); // second still holds

    second.close();
    expect(player.view().active).toBe(false);
  });
});

// ─── watchdog: stalled playlist triggers one rebuild ────────────────────────

describe("watchdog: position non-advancement", () => {
  beforeEach(() => { vi.useFakeTimers(); h.kept.length = 0; });
  afterEach(() => { vi.useRealTimers(); });

  async function makeWatched() {
    const { np, pa, opens } = setup([{ id: "a" }, { id: "b" }]);
    // Simulate what nowPlayingStore.ts does: subscribe to np and arm watchdog.
    const WATCHDOG_MS = 10_000;
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
    let watchdogKey = "";
    let watchdogRebuilt = false;
    let isRebuilding = false;

    const clearW = () => { if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; } };
    const armW = () => {
      clearW();
      watchdogTimer = setTimeout(async () => {
        watchdogTimer = null;
        const { id, status, index } = np.state();
        if (id !== "all" || status !== "playing") return;
        if (watchdogRebuilt) {
          await np.play({ id: "all", title: "Neville", route: "/library", empty: "Playback stopped. The playlist did not advance.", prepare: async () => null });
        } else {
          watchdogRebuilt = true;
          isRebuilding = true;
          const currentId = pa.idAtClipIndex(index) ?? null;
          pa.reset();
          await np.play(pa.jobFrom(currentId));
          isRebuilding = false;
        }
      }, WATCHDOG_MS);
    };
    np.subscribe(() => {
      const { id, status, index, progress } = np.state();
      if (id === "all" && status === "playing") {
        const key = `${index}:${Math.round((progress ?? 0) * 1000)}`;
        if (key !== watchdogKey) { watchdogKey = key; armW(); }
      } else {
        clearW(); watchdogKey = "";
        if (!isRebuilding) watchdogRebuilt = false;
      }
    });
    return { np, pa, opens };
  }

  it("rebuilds once when position does not advance for 10 seconds", async () => {
    const { np, pa, opens } = await makeWatched();
    await np.play(pa.job);
    opens[0].o.onState({ playing: true, index: 0, ended: false, progress: 0 });

    // 10 s pass with no progress.
    await vi.advanceTimersByTimeAsync(10_000);
    // A second session should be opened.
    expect(opens.length).toBeGreaterThan(1);
  });

  it("stops with a note when the rebuilt session also stalls", async () => {
    const { np, pa, opens } = await makeWatched();
    await np.play(pa.job);
    opens[0].o.onState({ playing: true, index: 0, ended: false, progress: 0 });

    // First stall.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(opens.length).toBeGreaterThan(1);

    // Rebuilt session starts playing but also stalls.
    opens.at(-1)!.o.onState({ playing: true, index: 0, ended: false, progress: 0 });
    await vi.advanceTimersByTimeAsync(10_000);

    expect(np.state().status).toBe("idle");
    expect(np.state().note).toBe("Playback stopped. The playlist did not advance.");
  });
});
