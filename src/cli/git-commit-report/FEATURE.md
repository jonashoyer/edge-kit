# Feature: Git Commit Report CLI

**Status:** `Active`
**Last Reviewed:** 2026-03-19
**Related ADRs:** [ADR-0010]
**PRD:** N/A

---

## What This Does

`src/cli/git-commit-report/` provides a reusable, copy-paste-friendly CLI
module for collecting committed git history over an explicit time range and
reporting per-commit context such as author identity, commit message, authored
date, files changed, and line-change stats. It backs the repo-level
`pnpm cli commits report` command while staying reusable in other codebases.

---

## Key Goals

- Keep git history collection explicit, local, and deterministic.
- Support author- and time-bounded reports without depending on remote APIs.
- Return structured commit data that is useful to humans and automation.
- Keep the repo-level CLI entrypoint thin and easy to lift into another codebase.
- Keep patch and body expansion opt-in so default output stays compact.

---

## Implementation Constraints

- DO use the local `git` binary as the source of truth for commit collection
  and diff statistics.
- DO require explicit time bounds and author filters in the public CLI.
- DO keep the reusable runtime in `src/cli/git-commit-report/`; `cli/index.ts`
  is only an example consumer.
- DO return normalized per-commit metadata, not just aggregate counts.
- DO keep patch expansion or body-heavy output opt-in.
- DO support JSON output for downstream tooling.
- DO keep reusable command/runtime imports direct from
  `report-command.ts` and `report.ts`.
- DO NOT inspect the worktree to synthesize commit history results.
- DO NOT add remote provider dependencies or API-based commit lookups.
- DO NOT hardcode a repo-specific default author list.
- DO NOT fold this into `src/cli/dev-launcher/`.

---

## Public API / Contracts

- Module exports:
  - `defaultGitCommitReportRuntime`
  - `collectGitCommitReport(...)`
  - `formatGitCommitReport(...)`
  - `createGitCommitReportCommand(...)`
  - `runGitCommitReportCommand(...)`
- Normalized report data:
  - `GitCommitReport`
  - `GitCommitReportEntry`
  - `GitCommitReportFileChange`
  - `CollectGitCommitReportOptions`
  - `GitCommitReportCommandOptions`
  - `GitCommitReportRuntime`
  - `GitCommitReportCommandRuntime`
- Command factory:
  - `createGitCommitReportCommand(...)`
- Runner:
  - `runGitCommitReportCommand(...)`
- CLI contract:
  - `pnpm cli commits report --since <date> --until <date> --author <pattern>`
  - `pnpm cli commits report --since <date> --author <pattern> --json`
  - `pnpm cli commits report --since <date> --until <date> --author <pattern> --patch`

Each report entry includes:

- commit hash and short hash
- author name and email
- authored timestamp
- commit subject, with optional body via `--body`
- files changed, additions, and deletions
- per-file numstat rows, with binary files marked explicitly
- optional full patch text via `--patch`

---

## Current State

Implemented: the reusable module family exists in `src/cli/git-commit-report/`
with direct imports from `report-command.ts` and `report.ts`.

Implemented: `collectGitCommitReport(...)` shells out to local `git log` with
`--since`, `--until`, `--author`, and `--numstat`, then normalizes per-commit
metadata and diff stats.

Implemented: `pnpm cli commits report` is registered in `cli/index.ts` and
supports human-readable output, JSON output, optional commit bodies, and
optional patches.

Implemented: targeted Vitest coverage exists for author filtering, JSON
serialization, body/patch expansion, and empty-author validation.

Verified: `pnpm exec vitest run src/cli/git-commit-report/report-command.test.ts`
and `pnpm exec biome check cli/index.ts src/cli/git-commit-report/report.ts
src/cli/git-commit-report/report-command.ts
src/cli/git-commit-report/report-command.test.ts README.md` pass.

Verified: `pnpm cli commits report --help` works; the command surface exposes
the required `--since`, `--until`, `--author`, `--json`, `--body`, `--patch`,
and `--cwd` flags.

Blocked: repo-wide `pnpm type-check` still fails on unrelated pre-existing
errors outside this feature area.

## Verification

- `pnpm exec vitest run src/cli/git-commit-report/report-command.test.ts`
- `pnpm exec biome check cli/index.ts src/cli/git-commit-report/report.ts src/cli/git-commit-report/report-command.ts src/cli/git-commit-report/report-command.test.ts README.md`
- `pnpm cli commits report --help`

---

## What NOT To Do

- Do not parse repository history from ad hoc filesystem state.
- Do not rely on a hosted git provider for the first version.
- Do not make the repo-level command the only place where the logic lives.
- Do not default to huge patch output in normal mode.
- Do not add a default author list or infer authors from repository state.
- Do not move commit collection into `src/cli/dev-launcher/`.
