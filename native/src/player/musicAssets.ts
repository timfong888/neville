// The bundled tracks (the website's public/music files), as Metro assets.
import type { MusicChoice } from "@/lib/music";

const TRACKS = {
  "night-tide": require("../../../public/music/night-tide.mp3"),
  "morning-light": require("../../../public/music/morning-light.mp3"),
  rise: require("../../../public/music/rise.mp3"),
} as const;

export const musicAsset = (id: Exclude<MusicChoice, "none">): number => TRACKS[id];
