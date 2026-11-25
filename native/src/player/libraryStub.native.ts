import type { Manifestation } from "@/lib/library/model";
import { DEMO_ID, demoAudioUri, demoItem } from "./demo";

// A stand-in for the library seam, which another Phase 1 session owns. It has
// the two calls the Player needs, with the seam's names and signatures, so the
// swap is one import. On a phone only the built-in test item resolves until then.
export const library = {
  /** One saved item, or null when it is not on this device. */
  async get(id: string): Promise<Manifestation | null> {
    return id === DEMO_ID ? demoItem : null;
  },
  /** An address the audio seam can play, or null when there is no recording. */
  async audioUri(id: string): Promise<string | null> {
    return id === DEMO_ID ? demoAudioUri() : null;
  },
};
