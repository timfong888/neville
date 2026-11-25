import { DeviceStore } from "@/lib/library/store";
import { DEMO_ID, type PlayerItem, demoItem } from "./playerItem.shared";

export * from "./playerItem.shared";

// The Player's read-only view of the library: one item by id. On the web this
// is the website's device store (localStorage records, IndexedDB recordings).
// When the library seam lands, this file becomes one call to it.
export async function loadPlayerItem(id: string): Promise<PlayerItem | null> {
  if (id === DEMO_ID) return demoItem();
  const store = new DeviceStore();
  const item = (await store.load()).manifestations.find((m) => m.id === id);
  if (!item) return null;
  const blob = item.hasAudio ? await store.getAudio(id).catch(() => null) : null;
  return { item, audio: blob ? URL.createObjectURL(blob) : null };
}
