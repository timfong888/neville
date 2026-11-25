import type { KV } from "./kv.types";

// The website's own storage, so choices made there carry over.
export const kv: KV = {
  async get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
};
