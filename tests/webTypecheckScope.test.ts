import { existsSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// The web build (`next build`) type-checks every file in tsconfig.json's program.
// The Expo modules are not installed there, so nothing under native/ may be in it,
// directly or through an import. A native test that slips in breaks the Vercel build.
describe("web tsconfig scope", () => {
  it("keeps native/ and the native tests out of the web type-check", () => {
    const root = path.resolve(__dirname, "..");
    const configPath = path.join(root, "tsconfig.json");
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    expect(read.error).toBeUndefined();
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root);
    const program = ts.createProgram({ rootNames: parsed.fileNames, options: { ...parsed.options, noEmit: true } });
    const nativeDir = path.join(root, "native") + path.sep;
    const leaked = program
      .getSourceFiles()
      .map((f) => path.resolve(f.fileName))
      .filter((f) => f.startsWith(nativeDir) && !f.includes(`${path.sep}node_modules${path.sep}`));
    expect(existsSync(nativeDir)).toBe(true);
    expect(leaked).toEqual([]);
  });
});
