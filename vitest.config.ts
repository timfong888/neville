import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests are sorted into levels by file name, so a new test lands in the right
// level without a config change. A file that matches no pattern below is a unit test.
//
//   unit         pure functions; no network, no database server.
//   integration  one real boundary: a Postgres engine (PGlite in process, or the
//                server in DATABASE_URL). Name it *Db.test.ts, *-db.test.ts,
//                *concurrency*.test.ts, or put it in tests/integration/.
//   acceptance   one test per story criterion, named AT-<ticket>-<n>.test.ts, or in
//                tests/acceptance/.
//   native       tests of native/ code. They need `npm ci --prefix native` (Expo
//                modules and its tsconfig), so they run in their own CI job.
//
// Run one level with `npm run test:unit`, `test:integration`, `test:acceptance`,
// `test:native`. `npm test` runs unit, integration and acceptance.
const integration = [
  "tests/integration/**/*.test.ts",
  "tests/**/*Db.test.ts",
  "tests/**/*-db.test.ts",
  "tests/**/*concurrency*.test.ts",
  "tests/migrate.test.ts",
];
const acceptance = ["tests/acceptance/**/*.test.ts", "tests/**/AT-*.test.ts"];
const native = ["tests/native*.test.ts", "tests/webAudioSeam.test.ts"];

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // Native modules are not installed for this run; tests that touch them vi.mock these.
      "expo-audio": fileURLToPath(new URL("./tests/stubs/expo-audio.ts", import.meta.url)),
      "expo-file-system": fileURLToPath(new URL("./tests/stubs/expo-file-system.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: [...integration, ...acceptance, ...native, "**/node_modules/**"],
        },
      },
      { extends: true, test: { name: "integration", include: integration } },
      { extends: true, test: { name: "acceptance", include: acceptance } },
      { extends: true, test: { name: "native", include: native } },
    ],
  },
});
