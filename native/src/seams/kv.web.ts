import type { KvSeam } from "./types";

// Today's website keeps settings in localStorage; so does this.
export const kv: KvSeam = {
  async get(key) {
    return window.localStorage.getItem(key);
  },
  async set(key, value) {
    window.localStorage.setItem(key, value);
  },
  async remove(key) {
    window.localStorage.removeItem(key);
  },
};
