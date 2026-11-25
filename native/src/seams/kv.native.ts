import { File, Paths } from "expo-file-system";
import type { KV } from "./kv.types";

// One small JSON file in the app's documents folder. It survives a force-quit and an app update.
const file = () => new File(Paths.document, "neville-kv.json");
let cache: Record<string, string> | null = null;

function load(): Record<string, string> {
  if (cache) return cache;
  try {
    const f = file();
    const raw: unknown = f.exists ? JSON.parse(f.textSync()) : {};
    cache = raw && typeof raw === "object" ? (raw as Record<string, string>) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function save(next: Record<string, string>): boolean {
  cache = next;
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export const kv: KV = {
  async get(key) {
    const v = load()[key];
    return typeof v === "string" ? v : null;
  },
  async set(key, value) {
    return save({ ...load(), [key]: value });
  },
  async remove(key) {
    const { [key]: _gone, ...rest } = load();
    save(rest);
  },
};
