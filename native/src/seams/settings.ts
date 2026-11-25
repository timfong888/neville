// The one module Create, Player and Settings use for voice, pace and tone.
//   const s = await settings.read();          // { voiceId, pace, tone }
//   const { settings: s, ready } = useSettings();
import { useEffect, useState } from "react";
import { DEFAULT_PACE_ID, DEFAULT_TONE_ID } from "@/lib/delivery";
import { DEFAULT_VOICE_ID } from "@/lib/voices";
import { kv } from "./kv";
import { makeSettingsStore, type Settings } from "./settingsCore";

export type { Settings } from "./settingsCore";

export const settings = makeSettingsStore(kv);

export const DEFAULT_SETTINGS: Settings = { voiceId: DEFAULT_VOICE_ID, pace: DEFAULT_PACE_ID, tone: DEFAULT_TONE_ID };

/** The current choices, kept up to date as they change. `ready` is false until storage has been read. */
export function useSettings(): { settings: Settings; ready: boolean } {
  const [value, setValue] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    const load = () =>
      void settings.read().then((s) => {
        if (!live) return;
        setValue(s);
        setReady(true);
      });
    load();
    const off = settings.subscribe(load);
    return () => {
      live = false;
      off();
    };
  }, []);
  return { settings: value, ready };
}
