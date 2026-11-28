// #262: two-size playback widget — one store, large control on player/library pages, small bar elsewhere.
import { describe, expect, it } from "vitest";
import { isActive, makeNowPlaying } from "@/native/src/player/nowPlaying";
import type { NowPlayingState } from "@/native/src/player/nowPlaying";

// Routes where the LARGE widget lives — small bar must be absent on these screens.
const LARGE_SCREENS = ["/library", "/player/", "/library/", "/create/recording"];

function hasLargeWidget(route: string): boolean {
  return LARGE_SCREENS.some(r => route === r || (r.endsWith("/") && route.startsWith(r)));
}

const np = (overrides: Partial<NowPlayingState> = {}): NowPlayingState => ({
  status: "idle", id: "", title: "", route: "", index: 0,
  position: 0, total: 0, loop: false, note: "", progress: 0,
  ...overrides,
});

describe("playback widget routing", () => {
  it("small bar is absent when idle", () => {
    expect(isActive(np())).toBe(false);
  });

  it("small bar is visible when playing", () => {
    expect(isActive(np({ status: "playing" }))).toBe(true);
  });

  it("small bar is visible when stopped-mid", () => {
    expect(isActive(np({ status: "stopped-mid" }))).toBe(true);
  });

  it("library tab has large widget", () => {
    expect(hasLargeWidget("/library")).toBe(true);
  });

  it("player, library detail, and create/recording have large widget", () => {
    expect(hasLargeWidget("/player/m1")).toBe(true);
    expect(hasLargeWidget("/library/m1")).toBe(true);
    expect(hasLargeWidget("/create/recording")).toBe(true);
  });

  it("small-bar screens do not have the large widget", () => {
    for (const r of ["/create", "/create/voice", "/create/script", "/settings", "/account"]) {
      expect(hasLargeWidget(r)).toBe(false);
    }
  });

  it("exactly one control per route while playing: small-bar pages show bar, no large widget", () => {
    const playing = np({ status: "playing" });
    for (const r of ["/create", "/settings", "/account", "/create/voice", "/create/script"]) {
      expect(isActive(playing) && !hasLargeWidget(r)).toBe(true);
    }
  });

  it("exactly one control per route while playing: large-widget pages skip the small bar", () => {
    for (const r of ["/library", "/player/m1", "/library/m1", "/create/recording"]) {
      expect(hasLargeWidget(r)).toBe(true);
    }
  });

  it("one store feeds both sizes: same state machine drives large and small controls", async () => {
    type Opts = { title: string; loop?: boolean; onState(s: { playing: boolean; index: number; ended: boolean }): void };
    let count = 0;
    const audio = {
      configure: async () => undefined,
      opened: () => count,
      open: (_srcs: string[], o: Opts) => {
        count++;
        return { srcs: _srcs, o, play: () => undefined, pause: () => undefined, stop: () => undefined };
      },
    };
    const ctrl = makeNowPlaying(audio);
    await ctrl.play({
      id: "m1", title: "My wish", route: "/player/m1", empty: "",
      prepare: async () => ({ clips: ["m1.wav"], loop: false, at: () => ({ title: "My wish", position: 1, total: 1 }) }),
    });
    // Both sizes read from the same state.
    expect(ctrl.state().status).toBe("playing");
    expect(isActive(ctrl.state())).toBe(true);
    // small bar: visible
    expect(isActive(ctrl.state()) && !hasLargeWidget("/settings")).toBe(true);
    // large widget: visible at player route
    expect(hasLargeWidget(ctrl.state().route)).toBe(true);
  });
});
