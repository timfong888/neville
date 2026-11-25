import type { KV } from "./kv.types";

// The website's own storage, so choices made there carry over.
// A value the browser refuses to store (private mode, full) is kept in memory until the page closes.
const unsaved = new Map<string, string>();

export const kv: KV = {
  async get(key) {
    if (unsaved.has(key)) return unsaved.get(key)!;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      window.localStorage.setItem(key, value);
      unsaved.delete(key);
      return true;
    } catch {
      unsaved.set(key, value);
      return false;
    }
  },
  async remove(key) {
    unsaved.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to remove when storage is blocked.
    }
  },
};
