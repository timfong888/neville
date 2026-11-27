// The one controller for the app, and the Library loop's job. They live outside any screen.
import { useSyncExternalStore } from "react";
import { audio } from "../seams/audio";
import { library } from "../seams/library";
import { bellNow, onBellChange } from "./bellStore";
import { libraryRecordings } from "./copies";
import { makeNowPlaying } from "./nowPlaying";
import type { PlayJob } from "./nowPlaying";
import { makePlayAll } from "./playAll";

export const nowPlaying = makeNowPlaying(audio);
export const playAll = makePlayAll({ save: (n, b, m) => audio.save(n, b, m), load: (gone) => libraryRecordings(gone), bell: bellNow });
// The gap clip carries the bell or not, so a changed choice makes the copies again (#177).
onBellChange(() => playAll.reset());
// A recording may be deleted or replaced under what plays. Rebuild and continue instead of stopping (#237).
library.subscribe(() => {
  const { id, status, index } = nowPlaying.state();
  playAll.reset();
  if (id === "all" && (status === "playing" || status === "paused")) {
    const currentId = playAll.idAtClipIndex(index) ?? null;
    void nowPlaying.play(playAll.jobFrom(currentId));
  } else if (id !== "all") {
    nowPlaying.stop();
  }
});

// Watchdog: if position does not advance for 10 s while playing, rebuild the queue once (#237).
// A second stall after the rebuild stops everything and shows a note.
const WATCHDOG_MS = 10_000;
let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
let watchdogKey = "";
let watchdogRebuilt = false;
// True while a watchdog rebuild is in flight, so the idle→playing transition does not reset watchdogRebuilt.
let isWatchdogRebuilding = false;

const clearWatchdog = () => {
  if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
};
const armWatchdog = () => {
  clearWatchdog();
  watchdogTimer = setTimeout(async () => {
    watchdogTimer = null;
    const { id, status, index } = nowPlaying.state();
    if (id !== "all" || status !== "playing") return;
    if (watchdogRebuilt) {
      console.warn("[playlist_stall]", { reason: "rebuild_failed" });
      const stopJob: PlayJob = { id: "all", title: "Neville", route: "/library", empty: "Playback stopped. The playlist did not advance.", prepare: async () => null };
      await nowPlaying.play(stopJob);
    } else {
      watchdogRebuilt = true;
      console.warn("[playlist_stall]", { reason: "no_progress" });
      isWatchdogRebuilding = true;
      const currentId = playAll.idAtClipIndex(index) ?? null;
      playAll.reset();
      await nowPlaying.play(playAll.jobFrom(currentId));
      isWatchdogRebuilding = false;
    }
  }, WATCHDOG_MS);
};

nowPlaying.subscribe(() => {
  const { id, status, index, progress } = nowPlaying.state();
  if (id === "all" && status === "playing") {
    const key = `${index}:${Math.round((progress ?? 0) * 1000)}`;
    if (key !== watchdogKey) {
      watchdogKey = key;
      armWatchdog();
    }
  } else {
    clearWatchdog();
    watchdogKey = "";
    if (!isWatchdogRebuilding) watchdogRebuilt = false;
  }
});

export const useNowPlaying = () => useSyncExternalStore(nowPlaying.subscribe, nowPlaying.state);
