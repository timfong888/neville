// Browser playback helpers shared by the create page and the playlist player.

/** Where each line starts, as a share of the whole script, for read-along. */
export function lineStarts(lines: string[]): number[] {
  const total = lines.reduce((n, l) => n + l.length, 0) || 1;
  let at = 0;
  return lines.map((l) => {
    const start = at / total;
    at += l.length;
    return start;
  });
}
