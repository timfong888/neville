import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // Native modules are not installed for this run; tests that touch them vi.mock these.
      "expo-audio": fileURLToPath(new URL("./tests/stubs/expo-audio.ts", import.meta.url)),
      "expo-file-system": fileURLToPath(new URL("./tests/stubs/expo-file-system.ts", import.meta.url)),
    },
  },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
