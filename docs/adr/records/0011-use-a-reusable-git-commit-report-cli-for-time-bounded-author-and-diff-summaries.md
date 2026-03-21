# [0011] Use a reusable git commit report CLI for time-bounded author and diff summaries

**Status:** `Implemented`

**Date:** 2026-03-19

---

## TL;DR

Edge Kit now includes a reusable `src/cli/git-commit-report/` module family
plus an example `pnpm cli commits report` command that collects committed
history for one or more authors within an explicit time range and returns
structured context such as author identity, commit message, date, file-level
diff stats, and optional patch/body output. The feature stays repo-local, uses
native `git` as its source of truth, and keeps orchestration out of
`cli/index.ts` beyond command registration.

---

## Decision

Git commit collection is implemented as a dedicated reusable CLI module family
under `src/cli/git-commit-report/`, with a separate example CLI entrypoint in
`cli/index.ts` that exposes `pnpm cli commits report` for this repository.

The command is time-bounded and author-filtered. It accepts explicit range
inputs using git-compatible date bounds such as `--since <value>` and
`--until <value>`, plus repeatable author filters through `--author <pattern>`.
The report is derived from committed history only, not from the current
worktree state.

The feature must return structured commit context for each matched commit,
including at minimum:

- commit hash
- short hash
- author name and email
- authored date
- commit subject
- line additions and deletions
- files changed
- per-file diff stats

Optional patch or body output is exposed behind explicit `--patch` and
`--body` flags. The default report stays compact and human-readable, while
`--json` provides a machine-readable form for downstream automation.

The implementation uses the local `git` CLI as the source of truth for
history, date filtering, author filtering, and diff statistics. The reusable
module exposes both a normalized data model and formatting helpers, while the
repo-level CLI entrypoint remains thin and does not embed git history logic
directly.

### Alternatives Considered

- **Inline `git log` parsing inside `cli/index.ts`:** Rejected — would make the
  repo entrypoint the only implementation and prevent reuse elsewhere.
- **Use a JS git library such as `simple-git`:** Rejected — adds dependency
  surface and reduces liftability compared with a copy-paste-friendly CLI that
  shells out to the local `git` binary.
- **Use remote provider APIs or GitHub search:** Rejected — the feature should
  work offline and against any local clone, not only hosted repositories with
  network access.
- **Report current worktree diffs instead of committed history:** Rejected —
  the requested use case is author/time-bounded commit context, which should
  stay focused on existing commits.

---

## Constraints

- `src/cli/git-commit-report/` must stay reusable, dependency-light, and free
  of repo-specific business logic.
- The example command in `cli/index.ts` is only a consumer of the reusable
  module; it must not become the only place where git collection logic lives.
- The command must use explicit date bounds and author filters. Do not infer a
  time window from repository state or hidden defaults.
- Commit selection must come from `git` history only. Do not inspect the
  current worktree to synthesize results.
- The report must include normalized commit metadata and diff stats for each
  entry. Do not collapse the feature into a single aggregate count only.
- `--author` is repeatable in the CLI and is combined into a single git author
  regex for collection.
- Any patch or body expansion must be opt-in so large ranges do not explode the
  default output size.
- The feature must support non-interactive execution and return deterministic
  output for the same repository state and CLI arguments.
- Existing MCP entrypoints under `cli/mcp.ts` and `cli/cli-mcp.ts` remain
  separate and must not be folded into this feature.

---

## Consequences

**Positive:** The repo gains a reusable git-history reporting primitive that
can power audits, changelog generation, and commit summaries without tying the
implementation to one repository layout.

**Positive:** Structured output makes the command useful both for humans and
for later automation or downstream scripts.

**Negative:** Large date ranges can be expensive to query, so the formatting
and filtering logic must stay disciplined about output size and parsing.

**Observed tradeoff:** `--patch` can materially increase output size and query
cost because each matched commit performs an additional `git show` call.

**Observed tradeoff:** the CLI help and output shape are intentionally compact;
more elaborate author rollups and repository-wide summaries remain deferred
until the base commit-collection contract proves stable.

---

## Assumptions and Defaults

- Assumes the local repository has `git` available on `PATH`.
- Assumes authors are filtered by git author identity, not by committer-only
  metadata unless explicitly added later.
- Assumes the default report should be structured and compact, with human
  formatting and patch expansion as opt-in layers.
- Assumes the first version should work against any local clone without remote
  API credentials.

---

## Current State

Implemented: `src/cli/git-commit-report/` now owns the reusable collection,
formatting, and command-factory logic for git commit reports.

Implemented: `cli/index.ts` registers `pnpm cli commits report`, and the
command supports required `--since` / `--until`, repeatable `--author`,
optional `--json`, `--body`, and `--patch`, plus repo-local `--cwd` override
support.

Implemented: targeted Vitest coverage and Biome checks pass on the changed
files, including parse/format behavior and the CLI wrapper contract.

Implemented: the README discoverability section now advertises the new command.

Observed: a full repo `type-check` currently fails because of unrelated
pre-existing errors elsewhere in the tree, not because of this feature.

---

## User Flow / Public API / Contract Changes

Before:

- Edge Kit has reusable CLI infrastructure for dev launching, but no generic
  commit history reporting command.

After:

- New CLI contract:

```bash
pnpm cli commits report --since <date> --until <date> --author <pattern>
pnpm cli commits report --since <date> --author <pattern> --json
pnpm cli commits report --since <date> --until <date> --author <pattern> --patch
```

- New report fields per commit:

```ts
type GitCommitReportEntry = {
  hash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  subject: string;
  body?: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  fileChanges: Array<{
    path: string;
    additions: number | null;
    deletions: number | null;
    isBinary: boolean;
  }>;
  patch?: string;
};
```

Validation and shipped state:

- `--since` and `--until` are required by the command parser.
- `--author` is repeatable and defaults to an empty list until collection time.
- The implementation was verified with targeted Vitest coverage and Biome
  checks on the changed files.
- A full repo `type-check` currently fails because of unrelated pre-existing
  errors elsewhere in the tree, not because of this feature.

---

## Related ADRs

- [ADR-0003] Use a manifest-driven dev launcher for repo and monorepo scripts
- [ADR-0006] Add a TypeScript-defined developer actions subsystem
