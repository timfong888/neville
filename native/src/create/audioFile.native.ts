import { File, Paths } from "expo-file-system";

/** Puts recording bytes where the player can read them. On a phone: one cache file, replaced each time. */
export function audioFile(audio: ArrayBuffer, mime: string): { uri: string; release(): void } {
  // The player picks its decoder from the extension.
  const f = new File(Paths.cache, `create.${/wav/.test(mime) ? "wav" : /mp4|aac|m4a/.test(mime) ? "m4a" : "mp3"}`);
  if (f.exists) f.delete();
  f.create();
  f.write(new Uint8Array(audio));
  return { uri: f.uri, release: () => f.exists && f.delete() };
}
