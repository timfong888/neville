// The stored music choice, the build flag, and a hook for screens.
import { useEffect, useState } from "react";
import { kv } from "../seams/kv";
import { type MusicSettings, makeMusicStore, musicEnabled, musicFor } from "./music";
import { musicAsset } from "./musicAssets";

/** Off unless the build sets EXPO_PUBLIC_MUSIC=1. */
export const MUSIC_ENABLED = musicEnabled(process.env.EXPO_PUBLIC_MUSIC);
export const musicStore = makeMusicStore(kv);

/** The music to open a session with, from what `useMusic` returned. Nothing while the flag is off. */
export const musicNow = (s: MusicSettings | null) => (MUSIC_ENABLED && s ? musicFor(s, true, musicAsset) : undefined);

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
