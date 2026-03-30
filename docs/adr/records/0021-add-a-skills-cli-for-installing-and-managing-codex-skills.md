# [0021] Add a skills CLI for installing and managing Codex skills

**Status:** `Implemented`

**Date:** 2026-03-29

---

## TL;DR

Edge Kit now includes a reusable `src/cli/skills/` module family plus an
example `pnpm cli skills ...` entrypoint that installs and manages Codex skills
by copying skill directories into the user's global skill roots. The command
tracks provenance and content hashes in a destination-local `skills-lock.json`
and refuses to overwrite or delete unmanaged skills unless explicitly forced.

---

## Decision

Skill management is implemented as a dedicated reusable CLI module family
under `src/cli/skills/`, with `cli/index.ts` kept as a thin example consumer.

The command family provides deterministic, non-interactive skill management:

- `skills list`: enumerate skills in the selected destination root and report
  whether each skill is tracked, untracked, or missing.
- `skills install`: install a skill by copying a directory containing
  `SKILL.md` into the selected destination root.
- `skills remove`: remove an installed skill directory, but only if the skill
  is tracked unless the user passes `--force`.
- `skills verify`: recompute hashes for tracked skills and report drift.
- `skills info`: show provenance, hashes, and resolved install paths for one
  skill.

Destination roots:

- default: `~/.codex/skills`
- alternate tree: `~/.agents/skills` via `--tree agents`
- explicit override: `--root <path>`

Install sources:

- direct skill directory via `--path <path>`
- local repository via `--repo <path> --name <skill-name>`
- GitHub repository via `--repo <owner/repo> --name <skill-name>`

Repository installs resolve only the conservative v1 layouts:

- `.agents/skills/<name>`
- `.codex/skills/<name>`

State is persisted as JSON in a destination-local `skills-lock.json`, tracking:

- skill name
- source reference
- source type (`local` or `github`)
- optional source subpath within the repo
- computed content hash of the installed directory

GitHub installs use the local `git` binary (`git clone --depth=1`) into a temp
directory instead of a GitHub API client or JS git dependency.

### Alternatives Considered

- **One-off script outside `src/cli/`:** Rejected. It would not match the
  existing reusable CLI pattern and would be harder to test or lift into
  another repo.
- **Filesystem scanning only, with no lockfile:** Rejected. Safe removal and
  provenance inspection require tracking managed installs explicitly.
- **SQLite or another DB under `~/.codex`:** Rejected. The operational burden
  is disproportionate to the feature size.
- **GitHub APIs for fetching repos:** Rejected. They add auth, rate-limit, and
  dependency complexity without improving the core install flow.
- **Implicit updates during `list` or `install`:** Rejected. v1 stays explicit
  and safe; reinstall with `--force` is sufficient until update semantics are
  proven stable.

---

## Constraints

- The reusable implementation lives in `src/cli/skills/`; `cli/index.ts`
  remains a thin consumer.
- The tool defaults to `~/.codex/skills` and does not depend on `$CODEX_HOME`.
- Install requires a resolved directory containing `SKILL.md` at the skill
  root.
- Install does not overwrite an existing skill directory unless `--force` is
  passed.
- Remove does not delete an untracked skill directory unless `--force` is
  passed.
- Remote repo installs use the local `git` binary and do not add GitHub API
  dependencies.
- The command family remains non-interactive.
- Skill names are validated as directory names, not arbitrary paths.

---

## Consequences

Positive: developers can install and remove skills reproducibly without manual
copying.

Positive: `skills-lock.json` is enough to support safe removal, provenance, and
drift reporting without adding a database.

Negative: remote installs require both `git` and network access.

Negative: v1 intentionally supports only conservative repository layouts for
skill discovery, so arbitrary monorepo structures remain deferred.

---

## Assumptions and Defaults

- Codex global skills live in `~/.codex/skills`.
- Some environments also use `~/.agents/skills`, but Codex installs should
  default to `.codex`.
- `git` is available on `PATH` for remote installs.
- Default behavior is safe: no overwrite and no deletion of untracked content
  without `--force`.

---

## Current State

Implemented: `src/cli/skills/skills.ts` owns root resolution, install/remove
logic, lockfile handling, hashing, and repo-source resolution.

Implemented: `src/cli/skills/command.ts` exposes reusable Commander wiring for
`list`, `info`, `verify`, `install`, and `remove`.

Implemented: `cli/index.ts` registers the example `pnpm cli skills` command.

Implemented: targeted Vitest coverage verifies local installs, repo installs,
GitHub clone flow, safe removal, listing states, verification drift, and skill
info output.

Implemented: README discoverability now advertises the skills CLI.

Verified: `pnpm exec vitest run src/cli/skills/skills.test.ts` passes.

Verified: `pnpm exec biome check cli/index.ts src/cli/skills/command.ts src/cli/skills/skills.ts src/cli/skills/skills.test.ts`
passes.

Not implemented: a first-class `update` command. Reinstall with `--force`
remains the explicit update path for now.

---

## User Flow / Public API / Contract Changes

New CLI contract:

```bash
pnpm cli skills list
pnpm cli skills list --tree agents
pnpm cli skills install --path /path/to/skill-dir
pnpm cli skills install --repo vercel-labs/skills --name find-skills
pnpm cli skills install --repo /path/to/repo --name find-skills
pnpm cli skills remove find-skills
pnpm cli skills remove find-skills --force
pnpm cli skills verify
pnpm cli skills info find-skills
```

New reusable module surface:

- `createSkillsCommand(...)`
- `runSkillsInstallCommand(...)`
- `runSkillsListCommand(...)`
- `runSkillsInfoCommand(...)`
- `runSkillsRemoveCommand(...)`
- `runSkillsVerifyCommand(...)`
- `readSkillsLockfile(...)`
- `writeSkillsLockfile(...)`
- `computeSkillDirectoryHash(...)`

---

## Related ADRs

- [ADR-0011] Use a reusable git commit report CLI for time-bounded author and diff summaries
