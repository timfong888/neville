// The one Library loop for the app. It lives outside any screen, so it keeps playing across tabs.
import { useSyncExternalStore } from "react";
import { audio } from "../seams/audio";
import { library } from "../seams/library";
import { libraryRecordings } from "./copies";
import { makePlaylistLoop } from "./playlistLoop";

export const playlist = makePlaylistLoop({ audio, load: () => libraryRecordings(() => false), onLibraryChange: library.subscribe });

/** The Library loop's state, kept current. */
export const usePlaylist = () => useSyncExternalStore(playlist.subscribe, playlist.state);
