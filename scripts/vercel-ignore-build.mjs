// Vercel "ignoreCommand" (see vercel.json). Exit 0 = skip the build, exit 1 = build.
//
// Skips only PREVIEW deployments whose diff touches nothing but native/, docs/,
// evals/, .github/ or *.md files. A skipped preview creates no Neon branch.
// Whenever the answer is unclear (production, no diff, git failure) it builds.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SKIPPABLE = [/^native\//, /^docs\//, /^evals\//, /^\.github\//, /\.md$/];

/** Pure decision. Returns { skip, reason }. Only a non-empty, all-skippable preview diff skips. */
export function decide({ vercelEnv, files }) {
  if (vercelEnv !== "preview") return { skip: false, reason: `VERCEL_ENV=${vercelEnv ?? "unset"}: only previews may skip` };
  if (!Array.isArray(files) || files.length === 0) return { skip: false, reason: "no diff available: build to be safe" };
  const needed = files.filter((f) => !SKIPPABLE.some((re) => re.test(f)));
  if (needed.length > 0) return { skip: false, reason: `needs a build: ${needed[0]}${needed.length > 1 ? ` (+${needed.length - 1} more)` : ""}` };
  return { skip: true, reason: "only native/, docs/, evals/, .github/ or *.md changed" };
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 30_000 }).trim();

/** Files changed since the last deployed commit, else since the merge-base with main. null = unknown. */
export function changedFiles(env = process.env) {
  const head = env.VERCEL_GIT_COMMIT_SHA || "HEAD";
  const bases = [];
  const prev = env.VERCEL_GIT_PREVIOUS_SHA;
  if (prev) bases.push(() => { git("cat-file", "-e", `${prev}^{commit}`); return prev; });
  bases.push(() => {
    try { git("fetch", "--quiet", "--depth=200", "origin", "main"); } catch { /* shallow clone may already have it */ }
    return git("merge-base", "FETCH_HEAD", head);
  });
  for (const getBase of bases) {
    try {
      const base = getBase();
      const out = git("diff", "--name-only", "--no-renames", `${base}`, head);
      return out ? out.split("\n") : [];
    } catch { /* try the next base */ }
  }
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let result;
  try {
    const env = process.env;
    result = env.VERCEL_ENV === "preview"
      ? decide({ vercelEnv: env.VERCEL_ENV, files: changedFiles(env) })
      : decide({ vercelEnv: env.VERCEL_ENV, files: [] });
  } catch (e) {
    result = { skip: false, reason: `error: ${e?.message ?? e}` };
  }
  console.log(`${result.skip ? "SKIP BUILD" : "BUILD"}: ${result.reason}`);
  process.exit(result.skip ? 0 : 1);
}
