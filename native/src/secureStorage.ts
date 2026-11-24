import * as SecureStore from "expo-secure-store";

/**
 * Keychain storage for the session cookie that stays readable while the phone is locked.
 * SecureStore's default is WHEN_UNLOCKED: with the screen locked, a read fails and the app looks
 * signed out, which would break fetching the next recording for background playback. AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
 * allows reads after the first unlock since boot, is protected by the device passcode, and does not
 * travel in backups or to another phone, so a restored backup cannot carry a live session.
 */
const opts: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export const sessionStorage = {
  getItem: (key: string) => SecureStore.getItem(key, opts),
  getItemAsync: (key: string) => SecureStore.getItemAsync(key, opts),
  setItem: (key: string, value: string) => SecureStore.setItem(key, value, opts),
  setItemAsync: (key: string, value: string) => SecureStore.setItemAsync(key, value, opts),
};
