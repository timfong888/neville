// Moves what is saved on this device into the signed-in account. Framework-
// free so it can be tested with stand-in stores.
//
// Nothing is deleted from the device unless the account confirmed it has it:
// - a manifestation whose recording cannot be read right now is skipped and
//   stays on the device, so the only copy of a recording is never lost;
// - one item the server rejects does not stop the others;
// - items saved under an old non-UUID id get a fresh id, and playlists that
//   reference them are updated to match;
// - a playlist is removed from the device only when every item in it moved,
//   and until then every manifestation it lists stays on the device too, so a
//   retry saves the whole playlist in its original order (saves are upserts
//   by id, so saving an item again does not duplicate it).
import { isUuid, type Library, type Manifestation, newId, type Playlist } from "@/lib/library/model";

export type MoveSource = {
  load(): Promise<Library>;
  getAudio(id: string): Promise<Blob | null>;
  deleteManifestation(id: string): Promise<void>;
  deletePlaylist(id: string): Promise<void>;
};

export type MoveTarget = {
  saveManifestation(m: Manifestation, audio?: Blob | null): Promise<void>;
  savePlaylist(p: Playlist): Promise<void>;
};

export type MoveResult = { moved: number; kept: { title: string; reason: string }[] };

export async function moveDeviceWork(
  device: MoveSource,
  target: MoveTarget,
  onStep: (done: number, total: number) => void = () => {},
): Promise<MoveResult> {
  const lib = await device.load();
  const total = lib.manifestations.length + lib.playlists.length;
  let done = 0;
  const newIdFor = new Map<string, string>(); // device id -> account id, for items that moved
  const kept: MoveResult["kept"] = [];

  // Oldest first, so the account keeps the same order.
  for (const m of [...lib.manifestations].sort((a, b) => a.createdAt - b.createdAt)) {
    try {
      const audio = m.hasAudio ? await device.getAudio(m.id) : null;
      if (m.hasAudio && !audio) {
        kept.push({ title: m.title, reason: "its recording could not be read on this device just now" });
      } else {
        const id = isUuid(m.id) ? m.id : newId();
        await target.saveManifestation({ ...m, id }, audio);
        newIdFor.set(m.id, id);
      }
    } catch (e) {
      kept.push({ title: m.title, reason: e instanceof Error ? e.message : "the account did not accept it" });
    }
    onStep(++done, total);
  }

  const playlistsDone: string[] = [];
  for (const p of lib.playlists) {
    const ids = p.itemIds.map((x) => newIdFor.get(x)).filter((x): x is string => !!x);
    try {
      await target.savePlaylist({ ...p, id: isUuid(p.id) ? p.id : newId(), itemIds: ids });
      // Keep the device copy while any of its items is still only on the device.
      if (ids.length === p.itemIds.length) playlistsDone.push(p.id);
    } catch (e) {
      kept.push({ title: p.name, reason: e instanceof Error ? e.message : "the account did not accept it" });
    }
    onStep(++done, total);
  }

  for (const id of playlistsDone) await device.deletePlaylist(id);
  // Deleting a manifestation also strips it from device playlists, so keep any
  // that a not-yet-finished playlist still lists.
  const held = new Set(lib.playlists.filter((p) => !playlistsDone.includes(p.id)).flatMap((p) => p.itemIds));
  for (const id of newIdFor.keys()) if (!held.has(id)) await device.deleteManifestation(id);
  return { moved: newIdFor.size, kept };
}
