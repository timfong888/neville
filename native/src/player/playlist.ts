// The one Library loop for the app. It lives outside any screen, so it keeps playing while the listener
// moves between tabs; opening a manifestation stops it (see the Player).
import { useSyncExternalStore } from "react";
import { audio } from "../seams/audio";
import { libraryRecordings } from "./copies";
import { makePlaylistLoop } from "./playlistLoop";

export const playlist = makePlaylistLoop({ audio, load: () => libraryRecordings(() => false) });

/** The Library loop's state, kept current. */
export const usePlaylist = () => useSyncExternalStore(playlist.subscribe, playlist.state);
