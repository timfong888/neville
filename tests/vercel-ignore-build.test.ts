import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script, no types
import { decide } from "../scripts/vercel-ignore-build.mjs";

const SCRIPT = path.resolve(__dirname, "../scripts/vercel-ignore-build.mjs");

describe("decide", () => {
  const preview = (files: string[]) => decide({ vercelEnv: "preview", files }).skip;

  it("production always builds, even for a native-only diff", () => {
    expect(decide({ vercelEnv: "production", files: ["native/a.ts"] }).skip).toBe(false);
  });
  it("development, unset and unknown environments build", () => {
    expect(decide({ vercelEnv: undefined, files: ["native/a.ts"] }).skip).toBe(false);
    expect(decide({ vercelEnv: "staging", files: ["native/a.ts"] }).skip).toBe(false);
  });
  it("native-only preview skips", () => expect(preview(["native/app/index.tsx", "native/package.json"])).toBe(true));
  it("docs, evals, .github and markdown-only previews skip", () => {
    expect(preview(["docs/specs/x.png"])).toBe(true);
    expect(preview(["evals/a.ts"])).toBe(true);
    expect(preview([".github/workflows/x.yml"])).toBe(true);
    expect(preview(["README.md", "CLAUDE.md"])).toBe(true);
  });
  it.each(["app/page.tsx", "lib/server/x.ts", "db/migrations/1.sql", "config/x.ts", "package.json", "package-lock.json", "vercel.json", "next.config.ts", "scripts/migrate.mjs", "public/a.png"])(
    "a preview touching %s builds, even next to native files",
    (f) => {
      expect(preview([f])).toBe(false);
      expect(preview(["native/a.ts", f])).toBe(false);
    },
  );
  it("a path that merely contains native/ deeper down builds", () => expect(preview(["app/native/x.ts"])).toBe(false));
  it("an unknown or empty diff builds", () => {
    expect(preview([])).toBe(false);
    expect(decide({ vercelEnv: "preview", files: null }).skip).toBe(false);
  });
});

describe("CLI", () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

  function repo() {
    const dir = mkdtempSync(path.join(tmpdir(), "ignore-build-"));
    dirs.push(dir);
    const g = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "pipe" }).toString().trim();
    g("init", "-q", "-b", "main");
    g("config", "user.email", "t@example.com");
    g("config", "user.name", "t");
    const commit = (file: string) => {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      writeFileSync(path.join(dir, file), String(Math.random()));
      g("add", "-A");
      g("commit", "-q", "-m", file);
      return g("rev-parse", "HEAD");
    };
    return { dir, g, commit };
  }
  const run = (dir: string, env: Record<string, string>) =>
    spawnSync("node", [SCRIPT], { cwd: dir, env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv, encoding: "utf8" }).status;

  it("skips a native-only change since the previous deployed sha (exit 0)", () => {
    const { dir, commit } = repo();
    const prev = commit("app/page.tsx");
    const head = commit("native/a.ts");
    expect(run(dir, { VERCEL_ENV: "preview", VERCEL_GIT_PREVIOUS_SHA: prev, VERCEL_GIT_COMMIT_SHA: head })).toBe(0);
  });
  it("builds when an earlier commit in the push touched app/ (exit 1)", () => {
    const { dir, commit } = repo();
    const prev = commit("README.md");
    commit("app/page.tsx");
    const head = commit("native/a.ts");
    expect(run(dir, { VERCEL_ENV: "preview", VERCEL_GIT_PREVIOUS_SHA: prev, VERCEL_GIT_COMMIT_SHA: head })).toBe(1);
  });
  it("builds production even for a native-only change", () => {
    const { dir, commit } = repo();
    const prev = commit("app/page.tsx");
    const head = commit("native/a.ts");
    expect(run(dir, { VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: prev, VERCEL_GIT_COMMIT_SHA: head })).toBe(1);
  });
  it("builds a first deployment with no previous sha and no origin (unknown diff)", () => {
    const { dir, commit } = repo();
    commit("native/a.ts");
    expect(run(dir, { VERCEL_ENV: "preview" })).toBe(1);
  });
  it("builds when the previous sha is not in the clone", () => {
    const { dir, commit } = repo();
    const head = commit("native/a.ts");
    expect(run(dir, { VERCEL_ENV: "preview", VERCEL_GIT_PREVIOUS_SHA: "0".repeat(40), VERCEL_GIT_COMMIT_SHA: head })).toBe(1);
  });
  it("on a first deployment, diffs against main's merge-base when origin is reachable", () => {
    const { dir, g, commit } = repo();
    commit("app/page.tsx");
    const remote = mkdtempSync(path.join(tmpdir(), "ignore-build-origin-"));
    dirs.push(remote);
    execFileSync("git", ["clone", "-q", "--bare", dir, remote]);
    g("remote", "add", "origin", remote);
    g("checkout", "-q", "-b", "pr");
    const head = commit("native/a.ts");
    expect(run(dir, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_SHA: head })).toBe(0);
    const head2 = commit("lib/x.ts");
    expect(run(dir, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_SHA: head2 })).toBe(1);
  });
});
