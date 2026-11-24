import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Paid evals: run only on purpose, with `npm run eval:scripts`. Never part of `npm test`.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } },
  test: { include: ["evals/**/*.eval.ts"], environment: "node", testTimeout: 600_000 },
});
