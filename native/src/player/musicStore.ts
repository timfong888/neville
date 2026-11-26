// The stored music choice, the build flag, and hooks for screens.
import { useEffect, useState, useSyncExternalStore } from "react";
import { kv } from "../seams/kv";
import { musicPlayer } from "../seams/music";
import { type MusicSettings, bindMusic, makeMusicStore, musicEnabled } from "./music";
import { musicAsset } from "./musicAssets";

/** Off unless the build sets EXPO_PUBLIC_MUSIC=1. */
export const MUSIC_ENABLED = musicEnabled(process.env.EXPO_PUBLIC_MUSIC);
export const musicStore = makeMusicStore(kv);

// From the moment this module loads, the music player follows the stored choice: a change made while a
// recording plays changes the music at once, on any screen, and Off removes it (#184).
bindMusic(musicStore, musicPlayer.setTarget, MUSIC_ENABLED, musicAsset);

export function useMusic(): MusicSettings | null {
  const [s, setS] = useState<MusicSettings | null>(null);
  useEffect(() => {
    if (!MUSIC_ENABLED) return;
    let live = true;
    const load = () => void musicStore.read().then((v) => live && setS(v));
    load();
    const off = musicStore.subscribe(load);
    return () => {
      live = false;
      off();
    };
  }, []);
  return s;
}

/** What the music player really has: the track loading or playing, and whether a session holds it. */
export const useMusicView = () => useSyncExternalStore(musicPlayer.subscribe, musicPlayer.view, musicPlayer.view);
