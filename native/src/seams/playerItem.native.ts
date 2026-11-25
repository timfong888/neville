import { DEMO_ID, type PlayerItem, demoItem } from "./playerItem.shared";

export * from "./playerItem.shared";

// The Player's read-only view of the library: one item by id. On a phone the
// library seam (files on the device) is not on main yet, so only the built-in
// test item resolves. When the library seam lands, this file becomes one call to it.
export async function loadPlayerItem(id: string): Promise<PlayerItem | null> {
  return id === DEMO_ID ? demoItem() : null;
}
