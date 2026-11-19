// Decides a recording's type from its first bytes, never from the
// client-supplied Content-Type. Framework-free so tests can import it.

/** "audio/wav", "audio/mpeg", or null when the bytes are neither. */
export function sniffAudio(head: Uint8Array): "audio/wav" | "audio/mpeg" | null {
  const ascii = (from: number, s: string) => [...s].every((c, i) => head[from + i] === c.charCodeAt(0));
  if (head.length >= 12 && ascii(0, "RIFF") && ascii(8, "WAVE")) return "audio/wav";
  // MP3 with an ID3v2 tag, or a bare MPEG audio frame (11 sync bits, layer III).
  if (head.length >= 3 && ascii(0, "ID3")) return "audio/mpeg";
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0 && (head[1] & 0x06) === 0x02) return "audio/mpeg";
  return null;
}
