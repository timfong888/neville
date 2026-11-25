import type { Manifestation } from "@/lib/library/model";
import { DeviceStore } from "@/lib/library/store";
import { DEMO_ID, demoAudioUri, demoItem } from "./demo";

// A stand-in for the library seam, which another Phase 1 session owns. It has
// the two calls the Player needs, with the seam's names and signatures, so the
// swap is one import. On the web it reads the website's device store.
const store = new DeviceStore();

export const library = {
  /** One saved item, or null when it is not on this device. */
  async get(id: string): Promise<Manifestation | null> {
    if (id === DEMO_ID) return demoItem;
    return (await store.load()).manifestations.find((m) => m.id === id) ?? null;
  },
  /** An address the audio seam can play, or null when there is no recording. */
  async audioUri(id: string): Promise<string | null> {
    if (id === DEMO_ID) return demoAudioUri();
    const blob = await store.getAudio(id).catch(() => null);
    return blob ? URL.createObjectURL(blob) : null;
  },
};
