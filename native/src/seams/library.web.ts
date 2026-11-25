import { CHANGED, DeviceStore } from "@/lib/library/store";
import type { AudioBytes, DeviceLibrary } from "./library.types";

export type { AudioBytes, DeviceLibrary } from "./library.types";

// The website's own device store: records in localStorage, recordings in IndexedDB.
// Items saved on the website show up here, and the other way round.
const store = new DeviceStore();
const blob = (a: AudioBytes) => new Blob([a.bytes as BlobPart], { type: a.mime });
// One object URL per item, so asking again does not pin another copy of the recording in memory.
const urls = new Map<string, string>();
const forget = (id: string) => {
  const u = urls.get(id);
  if (u) URL.revokeObjectURL(u);
  urls.delete(id);
};

export const library: DeviceLibrary = {
  load: () => store.load(),
  async get(id) {
    return (await store.load()).manifestations.find((m) => m.id === id) ?? null;
  },
  async save(m, audio) {
    if (audio !== undefined) forget(m.id);
    const old = (await store.load()).manifestations.find((x) => x.id === m.id);
    if (!old) return store.saveManifestation(m, audio ? blob(audio) : null);
    return store.updateManifestation({ ...m, hasAudio: old.hasAudio }, audio ? blob(audio) : audio);
  },
  async remove(id) {
    forget(id);
    await store.deleteManifestation(id);
  },
  async audioUri(id) {
    const known = urls.get(id);
    if (known) return known;
    const b = await store.getAudio(id);
    if (!b) return null;
    const url = URL.createObjectURL(b);
    urls.set(id, url);
    return url;
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
