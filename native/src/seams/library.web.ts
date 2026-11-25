import { CHANGED, DeviceStore } from "@/lib/library/store";
import type { AudioBytes, DeviceLibrary } from "./library.types";

export type { AudioBytes, DeviceLibrary } from "./library.types";

// The website's own device store: records in localStorage, recordings in IndexedDB.
// Items saved on the website show up here, and the other way round.
const store = new DeviceStore();
const blob = (a: AudioBytes) => new Blob([a.bytes as BlobPart], { type: a.mime });

export const library: DeviceLibrary = {
  load: () => store.load(),
  async get(id) {
    return (await store.load()).manifestations.find((m) => m.id === id) ?? null;
  },
  async save(m, audio) {
    const old = (await store.load()).manifestations.find((x) => x.id === m.id);
    if (!old) return store.saveManifestation(m, audio ? blob(audio) : null);
    return store.updateManifestation({ ...m, hasAudio: old.hasAudio }, audio ? blob(audio) : audio);
  },
  remove: (id) => store.deleteManifestation(id),
  async audioUri(id) {
    const b = await store.getAudio(id);
    return b ? URL.createObjectURL(b) : null;
  },
  subscribe(fn) {
    const onStorage = (e: StorageEvent) => e.key?.startsWith("nv_library") && fn();
    window.addEventListener(CHANGED, fn);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGED, fn);
      window.removeEventListener("storage", onStorage);
    };
  },
};
