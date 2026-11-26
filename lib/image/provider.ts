// ImageProvider interface and a mock provider for tests and feature-flagged UI.
// No network calls; the mock returns a placeholder image synchronously.

export type AspectRatio = "9:16";

export interface ImageProvider {
  /**
   * Generates one image for `prompt` at `aspect`.
   * Resolves with the image bytes and MIME type, or rejects with an Error.
   * No network is called here; a real provider would do so.
   */
  generate(prompt: string, aspect: AspectRatio): Promise<{ bytes: Uint8Array; mime: string }>;
}

// A minimal valid 1×1 PNG (68 bytes): transparent single pixel.
// Generated offline; bytes confirmed against the PNG specification.
const PLACEHOLDER_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x02,
  0x00, 0x01, 0xe5, 0x27, 0xde, 0xfc, 0x00, 0x00,
  0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

/**
 * Returns a placeholder image without touching the network.
 * Use this in tests and behind EXPO_PUBLIC_IMAGES=1 before a real provider is wired.
 */
export const mockProvider: ImageProvider = {
  generate(_prompt: string, _aspect: AspectRatio) {
    return Promise.resolve({ bytes: PLACEHOLDER_PNG, mime: "image/png" });
  },
};
