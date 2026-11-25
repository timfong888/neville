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

/** What is saved on the phone, when the app can count it. */
export type DeviceData = { manifestations: number; playlists: number; draft: boolean };

/**
 * The native app's "delete my account" confirmation. In Phase 1 the library lives on the phone, so
 * deleting the account leaves it there; the prompt says what goes and names what stays.
 * `device` is undefined when the app cannot count what is on the phone.
 */
export function deleteAccountPrompt(device?: DeviceData): string {
  const goes = "This deletes your account and every manifestation, recording and playlist saved in it, and signs you out. It cannot be undone.";
  if (!device) return `${goes} Anything saved on this phone stays on this phone.`;
  const xs = items(device.manifestations, device.playlists, device.draft);
  return xs.length ? `${goes} Staying on this phone: ${list(xs)}.` : `${goes} Nothing is saved on this phone.`;
}

/** Shown after the account is gone. */
export const ACCOUNT_DELETED = "Your account and everything saved in it have been deleted.";

/**
 * Counts for deleteAccountPrompt from the library saved on the device. Undefined when the library is
 * empty: the app cannot yet see a wish being typed (the Create screen owns that), and an unreadable
 * library also loads as empty, so "nothing is saved on this phone" would be a claim it cannot back.
 */
export function deviceDataFromLibrary(lib: { manifestations: readonly unknown[]; playlists: readonly unknown[] }): DeviceData | undefined {
  const manifestations = lib.manifestations.length;
  const playlists = lib.playlists.length;
  return manifestations || playlists ? { manifestations, playlists, draft: false } : undefined;
}
