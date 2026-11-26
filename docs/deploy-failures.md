# Deploy failures

What an agent does when a Vercel preview fails. No human step unless noted.

## "Resource provisioning failed"

**Meaning.** The Neon project `neon-neville` is at its 10-branch limit. The Vercel
integration creates one `preview/<git branch>` Neon branch per preview deployment,
and there was no room for this one. The code is not at fault.

**Fix.**

1. Dispatch the Neon preview cleanup workflow with `dry_run=false`:
   `gh workflow run neon-preview-cleanup.yml -f dry_run=false`
   (or the GitHub Actions tool: workflow `neon-preview-cleanup.yml`, input `dry_run` = `false`).
2. Wait for the run to finish. Its log lists each branch as `DELETED`, `GONE` or `SKIP`.
3. Re-run the failed deployment (redeploy it from the Vercel deployment or its failed check).
   Do not push an empty commit.

The sweep only deletes `preview/*` branches whose git branch has no open PR.
It never touches `main`, the default, primary or protected Neon branch.

**If the sweep deleted nothing** and the error persists, every branch belongs to an open
PR. Do not delete Neon branches by hand. Report to the orchestrator: close or merge
PRs until at most 6 are open, then re-run the deployment.

## Why it should be rare

- Previews are skipped when a push touches only `native/`, `docs/`, `evals/`, `.github/`
  or `*.md` (`scripts/vercel-ignore-build.mjs`, set as `ignoreCommand` in `vercel.json`).
  Production always builds. A skipped preview creates no Neon branch.
- The cleanup workflow deletes a PR's branch when the PR closes, sweeps nightly, and
  sweeps when a PR opens, gets a push or reopens and branches are at 80% of the limit.
