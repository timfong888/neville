import { DeviceStore } from "@/lib/library/store";
import type { LibrarySeam } from "./types";

// Reuses the website's device store as it is today (localStorage records, IndexedDB recordings).
const store = new DeviceStore();

export const library: LibrarySeam = {
  load: () => store.load(),
  async save(m, audio) {
    const blob = audio ? new Blob([audio], { type: "audio/mpeg" }) : audio;
    const exists = (await store.load()).manifestations.some((x) => x.id === m.id);
    await (exists ? store.updateManifestation(m, blob) : store.saveManifestation(m, blob));
  },
  remove: (id) => store.deleteManifestation(id),
  async audioUri(id) {
    const b = await store.getAudio(id);
    return b ? URL.createObjectURL(b) : null;
  },
  savePlaylist: (p) => store.savePlaylist(p),
  deletePlaylist: (id) => store.deletePlaylist(id),
};
