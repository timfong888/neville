// #153: the web seam is shared by the Player and the Create step. A refused play() fails the start only
// before anything has played; after that it only pauses, so the listener keeps their place.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayState } from "@/native/src/seams/types";

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
  next: { name: string } | null = null;
  play = vi.fn(async () => {
    if (this.next) throw this.next;
    this.onplay?.();
  });
  pause = vi.fn();
  removeAttribute() {}
  constructor() {
    FakeAudio.all.push(this);
  }
}
const flush = () => new Promise((r) => setTimeout(r, 0));

let audio: typeof import("@/native/src/seams/audio.web").audio;
beforeEach(async () => {
  FakeAudio.all.length = 0;
  (globalThis as { Audio?: unknown }).Audio = FakeAudio;
  audio = (await import("@/native/src/seams/audio.web")).audio;
});

function open() {
  const states: PlayState[] = [];
  const session = audio.open(["blob:a"], { title: "t", onState: (s) => states.push(s) });
  return { session, states, a: FakeAudio.all[0] };
}

describe("web seam: a refused play()", () => {
  it("is a failed start before anything has played", async () => {
    const { session, states, a } = open();
    a.next = { name: "NotAllowedError" };
    session.play();
    await flush();
    expect(states.at(-1)).toMatchObject({ playing: false, failed: true });
  });
  it("only pauses once a clip has played", async () => {
    const { session, states, a } = open();
    session.play();
    await flush();
    session.pause();
    a.next = { name: "NotAllowedError" };
    session.play();
    await flush();
    expect(states.at(-1)?.playing).toBe(false);
    expect(states.at(-1)?.failed).toBeUndefined();
  });
  it("is not a failure when it is an AbortError, even before anything has played", async () => {
    const { session, states, a } = open();
    a.next = { name: "AbortError" };
    session.play();
    await flush();
    expect(states.at(-1)?.failed).toBeUndefined();
    expect(states.at(-1)?.playing).toBe(false);
  });
});

describe("web seam: a load that stalls", () => {
  it("fails the session after the load timeout, and pauses the element", async () => {
    vi.useFakeTimers();
    try {
      const { session, states, a } = open();
      session.play();
      await vi.advanceTimersByTimeAsync(8001);
      expect(states.at(-1)).toMatchObject({ playing: false, failed: true });
      expect(a.pause).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it("does not fail once the clip has loaded", async () => {
    vi.useFakeTimers();
    try {
      const { session, states, a } = open();
      session.play();
      a.oncanplay?.();
      await vi.advanceTimersByTimeAsync(20000);
      expect(states.some((s) => s.failed)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  it("does not fire after the session is stopped", async () => {
    vi.useFakeTimers();
    try {
      const { session, states } = open();
      session.play();
      session.stop();
      await vi.advanceTimersByTimeAsync(20000);
      expect(states.some((s) => s.failed)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("web seam: progress", () => {
  it("reports how far through the clip on each time update", async () => {
    const { session, states, a } = open();
    session.play();
    await flush();
    a.duration = 10;
    a.currentTime = 5;
    a.ontimeupdate?.();
    expect(states.at(-1)?.progress).toBe(0.5);
  });
  it("reports none while the length is unknown", async () => {
    const { session, states, a } = open();
    session.play();
    await flush();
    a.ontimeupdate?.();
    expect(states.at(-1)?.progress).toBeUndefined();
  });
});
