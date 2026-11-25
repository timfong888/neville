import { Directory, File, Paths } from "expo-file-system";

/** Small key-value settings (voice, pace, tone, the draft). Async because native storage is. */
export interface KvSeam {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

// One small file per key under the app's document directory.
const dir = () => {
  const d = new Directory(Paths.document, "kv");
  if (!d.exists) d.create({ intermediates: true });
  return d;
};
const file = (key: string) => new File(dir(), `${encodeURIComponent(key)}.txt`);

export const kv: KvSeam = {
  async get(key) {
    const f = file(key);
    return f.exists ? f.text() : null;
  },
  async set(key, value) {
    const f = file(key);
    if (!f.exists) f.create();
    f.write(value);
  },
  async remove(key) {
    const f = file(key);
    if (f.exists) f.delete();
  },
};
