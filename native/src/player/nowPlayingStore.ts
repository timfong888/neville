// The one controller for the app, and the Library loop's job. They live outside any screen.
import { useSyncExternalStore } from "react";
import { audio } from "../seams/audio";
import { library } from "../seams/library";
import { libraryRecordings } from "./copies";
import { makeNowPlaying } from "./nowPlaying";
import { makePlayAll } from "./playAll";

export const nowPlaying = makeNowPlaying(audio);
export const playAll = makePlayAll({ save: (n, b, m) => audio.save(n, b, m), load: () => libraryRecordings(() => false) });
// A recording may be deleted or replaced under the loop (on the phone it plays the Library's own files).
library.subscribe(() => (playAll.reset(), nowPlaying.stop("all")));

export const useNowPlaying = () => useSyncExternalStore(nowPlaying.subscribe, nowPlaying.state);
