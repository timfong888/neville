// Moves what is saved on this device into the signed-in account. Framework-
// free so it can be tested with stand-in stores.
//
// Nothing is deleted from the device unless the account confirmed it has it:
// - a manifestation whose recording cannot be read right now is skipped and
//   stays on the device, so the only copy of a recording is never lost;
// - one item the server rejects does not stop the others;
// - items saved under an old non-UUID id get a fresh id, and playlists that
//   reference them are updated to match;
// - a playlist is saved to the account only once every item in it has moved,
//   so the account never holds a partial copy; until then it, and every
//   manifestation it lists, stays on the device;
// - the device remembers, per account, which items it already has (device id ->
//   account id), so a later pass never saves them again. Edits made in the
//   account in the meantime are kept, and a legacy id keeps the one account id
//   it was first given;
// - if a remembered item was changed on the device after it moved (signed out,
//   then edited), the changed copy is saved to the account as a new
//   manifestation, so neither the account's version nor the device edit is lost.
import { isUuid, type Library, type Manifestation, newId, type Playlist } from "@/lib/library/model";

export type MoveSource = {
  load(): Promise<Library>;
  getAudio(id: string): Promise<Blob | null>;
  deleteManifestation(id: string): Promise<void>;
  deletePlaylist(id: string): Promise<void>;
  /** Items an earlier pass already saved to this account. */
  movedIds(accountId: string): Promise<MovedIds>;
  setMovedIds(accountId: string, ids: MovedIds): Promise<void>;
  /** Account ids this device already used for other accounts; ids are global, so they cannot be reused. */
  idsUsedByOtherAccounts(accountId: string): Promise<Set<string>>;
};

/** Device id -> the account id it was saved under, and a fingerprint of the device copy at that time. */
export type MovedIds = Record<string, { id: string; v: string }>;

/**
 * Changes whenever the device copy is edited or re-recorded. A SHA-256 digest,
 * so the record kept in browser storage holds no wish, name or script text.
 */
export async function fingerprint(m: Manifestation): Promise<string> {
  return sha256(JSON.stringify([m.updatedAt, m.title, m.want, m.firstName, m.lines, m.voiceId, m.voiceName, m.hasAudio]));
}

/** The same, for a playlist: changes when it is renamed or its items change. */
export async function playlistFingerprint(p: Playlist): Promise<string> {
  return sha256(JSON.stringify([p.updatedAt, p.name, p.itemIds]));
}

/** Playlists share the moved record with manifestations under this prefix. */
const PLAYLIST_KEY = (id: string) => `playlist:${id}`;

async function sha256(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type MoveTarget = {
  saveManifestation(m: Manifestation, audio?: Blob | null): Promise<void>;
  savePlaylist(p: Playlist): Promise<void>;
};

export type MoveResult = { moved: number; kept: { title: string; reason: string }[] };

export async function moveDeviceWork(
  device: MoveSource,
  target: MoveTarget,
  accountId: string,
  onStep: (done: number, total: number) => void = () => {},
): Promise<MoveResult> {
  const lib = await device.load();
  const total = lib.manifestations.length + lib.playlists.length;
  let done = 0;
  const known: MovedIds = { ...(await device.movedIds(accountId)) }; // saved on earlier passes
  const taken = await device.idsUsedByOtherAccounts(accountId);
  const newIdFor = new Map<string, string>(); // device id -> account id, for items now in the account
  let moved = 0;
  const kept: MoveResult["kept"] = [];

  // Oldest first, so the account keeps the same order.
  for (const m of [...lib.manifestations].sort((a, b) => a.createdAt - b.createdAt)) {
    try {
      const prior = known[m.id];
      if (prior && prior.v === (await fingerprint(m))) {
        // Already in the account and unchanged here: never save it again over
        // whatever was done to it in the account since.
        newIdFor.set(m.id, prior.id);
      } else {
        const audio = m.hasAudio ? await device.getAudio(m.id) : null;
        if (m.hasAudio && !audio) {
          kept.push({ title: m.title, reason: "its recording could not be read on this device just now" });
        } else {
          // A changed copy of an item already in the account goes in as a new
          // item beside it, rather than over it. An id another account on this
          // device already holds is taken server-wide, so it gets a fresh one.
          const id = !prior && isUuid(m.id) && !taken.has(m.id) ? m.id : newId();
          await target.saveManifestation({ ...m, id }, audio);
          newIdFor.set(m.id, id);
          known[m.id] = { id, v: await fingerprint(m) };
          moved++;
          await device.setMovedIds(accountId, known);
        }
      }
    } catch (e) {
      kept.push({ title: m.title, reason: e instanceof Error ? e.message : "the account did not accept it" });
    }
    onStep(++done, total);
  }

  const playlistsDone: string[] = [];
  for (const p of lib.playlists) {
    const ids = p.itemIds.map((x) => newIdFor.get(x)).filter((x): x is string => !!x);
    const key = PLAYLIST_KEY(p.id);
    const prior = known[key];
    if (ids.length < p.itemIds.length) {
      kept.push({ title: p.name, reason: "it moves once every manifestation in it has moved" });
    } else if (prior && prior.v === (await playlistFingerprint(p))) {
      // Saved by an earlier pass that stopped before removing it here: never save it over account edits again.
      playlistsDone.push(p.id);
    } else {
      try {
        // As for manifestations: a changed copy goes in beside the saved one, and an id another account holds is not reused.
        const id = !prior && isUuid(p.id) && !taken.has(p.id) ? p.id : newId();
        await target.savePlaylist({ ...p, id, itemIds: ids });
        known[key] = { id, v: await playlistFingerprint(p) };
        await device.setMovedIds(accountId, known);
        playlistsDone.push(p.id);
      } catch (e) {
        kept.push({ title: p.name, reason: e instanceof Error ? e.message : "the account did not accept it" });
      }
    }
    onStep(++done, total);
  }

  for (const id of playlistsDone) {
    await device.deletePlaylist(id);
    delete known[PLAYLIST_KEY(id)];
  }
  // Deleting a manifestation also strips it from device playlists, so keep any
  // that a playlist still on the device lists.
  const held = new Set(lib.playlists.filter((p) => !playlistsDone.includes(p.id)).flatMap((p) => p.itemIds));
  for (const id of newIdFor.keys()) {
    if (held.has(id)) continue;
    await device.deleteManifestation(id);
    delete known[id];
  }
  await device.setMovedIds(accountId, known);
  return { moved, kept };
}
