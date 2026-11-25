/** Small key-value storage on the device. Web: localStorage. Phone: one JSON file. */
export type KV = {
  get(key: string): Promise<string | null>;
  /** False when the device refuses storage (private mode, full disk). */
  set(key: string, value: string): Promise<boolean>;
  remove(key: string): Promise<void>;
};
