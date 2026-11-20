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
//   it was first given.
import { isUuid, type Library, type Manifestation, newId, type Playlist } from "@/lib/library/model";

export type MoveSource = {
  load(): Promise<Library>;
  getAudio(id: string): Promise<Blob | null>;
  deleteManifestation(id: string): Promise<void>;
  deletePlaylist(id: string): Promise<void>;
  /** Items an earlier pass already saved to this account: device id -> account id. */
  movedIds(accountId: string): Promise<Record<string, string>>;
  setMovedIds(accountId: string, ids: Record<string, string>): Promise<void>;
};

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
  const known = { ...(await device.movedIds(accountId)) }; // device id -> account id, saved on earlier passes
  const newIdFor = new Map<string, string>(); // device id -> account id, for items now in the account
  let moved = 0;
  const kept: MoveResult["kept"] = [];

  // Oldest first, so the account keeps the same order.
  for (const m of [...lib.manifestations].sort((a, b) => a.createdAt - b.createdAt)) {
    try {
      if (known[m.id]) {
        // Already in the account: never save it again over whatever was done there since.
        newIdFor.set(m.id, known[m.id]);
      } else {
        const audio = m.hasAudio ? await device.getAudio(m.id) : null;
        if (m.hasAudio && !audio) {
          kept.push({ title: m.title, reason: "its recording could not be read on this device just now" });
        } else {
          const id = isUuid(m.id) ? m.id : newId();
          await target.saveManifestation({ ...m, id }, audio);
          newIdFor.set(m.id, id);
          known[m.id] = id;
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
    if (ids.length < p.itemIds.length) {
      kept.push({ title: p.name, reason: "it moves once every manifestation in it has moved" });
    } else {
      try {
        await target.savePlaylist({ ...p, id: isUuid(p.id) ? p.id : newId(), itemIds: ids });
        playlistsDone.push(p.id);
      } catch (e) {
        kept.push({ title: p.name, reason: e instanceof Error ? e.message : "the account did not accept it" });
      }
    }
    onStep(++done, total);
  }

  for (const id of playlistsDone) await device.deletePlaylist(id);
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
