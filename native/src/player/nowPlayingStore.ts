// The one controller for the app, and the Library loop's job. They live outside any screen.
import { useSyncExternalStore } from "react";
import { audio } from "../seams/audio";
import { library } from "../seams/library";
import { bellNow, onBellChange } from "./bellStore";
import { libraryRecordings } from "./copies";
import { makeNowPlaying } from "./nowPlaying";
import { makePlayAll } from "./playAll";

export const nowPlaying = makeNowPlaying(audio);
export const playAll = makePlayAll({ save: (n, b, m) => audio.save(n, b, m), load: (gone) => libraryRecordings(gone), bell: bellNow });
// The gap clip carries the bell or not, so a changed choice makes the copies again (#177).
onBellChange(() => playAll.reset());
// A recording may be deleted or replaced under what plays (on the phone it plays the Library's own files).
library.subscribe(() => (playAll.reset(), nowPlaying.stop()));

export const useNowPlaying = () => useSyncExternalStore(nowPlaying.subscribe, nowPlaying.state);
