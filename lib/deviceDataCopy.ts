// Account page copy for what is saved in this browser, including an unsaved
// typed wish (#100), so the delete button never sits next to "0 … saved".

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function items(manifestations: number, playlists: number, draft: boolean): string[] {
  const out: string[] = [];
  if (manifestations) out.push(count(manifestations, "manifestation", "manifestations"));
  if (playlists) out.push(count(playlists, "playlist", "playlists"));
  if (draft) out.push("the wish you were typing");
  return out;
}

const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function deviceDataSummary(manifestations: number, playlists: number, draft: boolean): string {
  const xs = items(manifestations, playlists, draft);
  return xs.length ? `Saved in this browser: ${list(xs)}.` : "Nothing is saved in this browser yet.";
}

export function deleteDevicePrompt(manifestations: number, playlists: number, draft: boolean): string {
  return `Delete ${list(items(manifestations, playlists, draft))} from this device?`;
}
