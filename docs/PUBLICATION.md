# Publish the reviewed local release candidate

Release-candidate publication procedure for Milestones 6–9I. At the start of Milestone 10, `feature/crossfade-mvp` was at published HEAD `53a27081c23b89ce3cf1cc28dfe0b0a8eca87dd4`, with the reviewed changes local. The account owner authorized one normal commit and push to this existing feature branch, subject to all publication safety gates passing. This procedure updates the existing [PR #1](https://github.com/HivMindAI/crossfade-ai/pull/1); it does not authorize merging, deployment, or submission.

## Confirm the checkout and remote

From `D:\CROSSFADE` in PowerShell:

```powershell
git status --short --branch
git branch --show-current
git rev-parse HEAD
git remote get-url origin
gh auth status
```

Require branch `feature/crossfade-mvp` and repository `HivMindAI/crossfade-ai`. Do not print, request, or paste a token. Review the complete local diff and new files against [VALIDATION.md](VALIDATION.md). Re-run the documented checks if code or dependencies changed since that record. Keep `.env.example` empty of credential values, and keep `LICENSE` unchanged.

After publication authorization, fetch and compare before staging:

```powershell
git fetch origin feature/crossfade-mvp main
git rev-list --left-right --count HEAD...origin/feature/crossfade-mvp
git merge-base --is-ancestor origin/feature/crossfade-mvp HEAD
```

The expected divergence at the current base is `0 0`. Stop for review if the remote advanced or the ancestor check fails. Do not automatically rebase, overwrite local changes, reset, or force push.

## Stage the explicit reviewed files

```powershell
$reviewedPaths = @(
  '.env.example', 'README.md', 'package.json',
  'docs/ARCHITECTURE.md', 'docs/BACKEND_HANDOFF_M9F.md',
  'docs/BACKEND_HANDOFF_M9G.md', 'docs/BACKEND_HANDOFF_M9H.md',
  'docs/BRIDGE_EXPERIMENT.md', 'docs/FRONTEND_HANDOFF_M9D.md',
  'docs/DEPLOYMENT.md', 'docs/LIVE_BENCHMARK.md', 'docs/LIVE_JOURNEY.md',
  'docs/PR_DESCRIPTION.md', 'docs/PUBLICATION.md', 'docs/QLOO.md',
  'docs/SUBMISSION.md', 'docs/VALIDATION.md',
  'scripts/qloo-insights-classify.mjs', 'scripts/qloo-smoke.mjs',
  'src/app/globals.css',
  'src/components/workspace.tsx', 'src/lib/model.ts',
  'src/lib/negotiation.ts', 'src/lib/orchestrator.ts', 'src/lib/evaluation.ts',
  'src/lib/plan-response.ts', 'src/lib/plan-response.test.ts',
  'src/lib/benchmark.test.ts', 'src/lib/diagnostics.test.ts',
  'src/lib/hardening.test.ts', 'src/lib/qloo-search.mjs',
  'src/lib/qloo.ts', 'src/lib/qloo.test.ts',
  'src/lib/qloo-smoke.test.ts', 'e2e/fixtures.ts',
  'e2e/diagnostics.spec.ts', 'e2e/journey.spec.ts',
  'playwright.config.ts', 'vitest.config.ts'
)
git add -- $reviewedPaths
git diff --cached --check
git diff --cached --stat
git diff --cached
git status --short
```

Inspect all staged content, including new files, before committing. If another changed file appears, review it explicitly; do not replace this list with `git add .`. Build directories, dependencies, credentials, raw Qloo responses, and private local files must stay untracked. `next-env.d.ts` may temporarily change during the dev-server tests; the final production build restores its tracked build imports.

## Commit and push the authorized feature branch

```powershell
git commit -m "fix: validate Qloo Search, Movie and Book contracts"
git rev-parse HEAD
git push origin HEAD:refs/heads/feature/crossfade-mvp
```

Record the exact new SHA. The explicit destination is the existing feature branch. Never substitute `main`, use a force option, or merge PR #1 as part of publication.

## PR description and CI

The owner can paste [PR_DESCRIPTION.md](PR_DESCRIPTION.md) into the existing PR in their authenticated browser. If their CLI session is authorized, they may instead run once:

```powershell
gh pr edit 1 --repo HivMindAI/crossfade-ai --body-file docs/PR_DESCRIPTION.md
gh pr view 1 --repo HivMindAI/crossfade-ai --json url,headRefName,headRefOid,baseRefName
gh pr checks 1 --repo HivMindAI/crossfade-ai
```

The connected integration previously received HTTP 403 for PR editing. Do not repeatedly retry that integration or bypass a denial. Use the owner's own authorized session or browser. Confirm head `feature/crossfade-mvp`, base `main`, and the newly pushed SHA before attributing a CI result to this candidate. Wait for all checks; record failures accurately. A green CI run still does not verify authenticated Qloo, real shared quota controls, runtime units, rights, or public deployment.
