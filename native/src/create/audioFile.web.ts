/** Puts recording bytes where the player can read them. On the web: a blob URL, freed by `release`. */
export function audioFile(audio: ArrayBuffer, mime: string): { uri: string; release(): void } {
  const uri = URL.createObjectURL(new Blob([audio], { type: mime }));
  return { uri, release: () => URL.revokeObjectURL(uri) };
}
