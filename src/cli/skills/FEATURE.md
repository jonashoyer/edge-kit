# Feature: Skills CLI

**Status:** `Active`
**Last Reviewed:** 2026-03-29
**Related ADRs:** [ADR-0021]
**PRD:** N/A

---

## What This Does

`src/cli/skills/` provides a reusable, copy-paste-friendly CLI module for
installing, listing, verifying, inspecting, and removing global Codex skill
directories. It backs the repo-level `pnpm cli skills ...` commands while
keeping the implementation reusable outside this repository.

---

## Key Goals

- Keep global skill installation deterministic and non-interactive.
- Default to the real Codex global root, `~/.codex/skills`, without requiring
  `$CODEX_HOME`.
- Track only the minimum metadata needed for safe removal and provenance.
- Keep repo fetching dependency-light by using the local `git` binary.
- Keep the repo entrypoint thin; reusable logic lives in `src/cli/skills/`.

---

## Implementation Constraints

- DO keep reusable logic in `src/cli/skills/`; `cli/index.ts` is only a thin
  consumer.
- DO default installs to `~/.codex/skills`.
- DO support `--tree agents` for `~/.agents/skills` and `--root <path>` for
  explicit overrides.
- DO require that installed skill sources resolve to a directory containing
  `SKILL.md`.
- DO use a destination-local `skills-lock.json` to track provenance and hashes.
- DO use the local `git` binary for `owner/repo` installs.
- DO keep destructive actions explicit with `--force`.
- DO NOT overwrite an existing installed skill by default.
- DO NOT delete untracked skill directories by default.
- DO NOT introduce registry clients, GitHub API dependencies, or a database.
- DO NOT support arbitrary nested skill-name paths in v1.

---

## Public API / Contracts

- Module exports:
  - `defaultSkillsCommandRuntime`
  - `readSkillsLockfile(...)`
  - `writeSkillsLockfile(...)`
  - `computeSkillDirectoryHash(...)`
  - `collectSkillsVerifyResult(...)`
  - `runSkillsListCommand(...)`
  - `runSkillsInfoCommand(...)`
  - `runSkillsInstallCommand(...)`
  - `runSkillsRemoveCommand(...)`
  - `runSkillsVerifyCommand(...)`
  - `createSkillsCommand(...)`
- Lockfile:
  - `skills-lock.json` inside the destination root
  - `version`
  - `skills[name].source`
  - `skills[name].sourceType`
  - `skills[name].sourceSubpath?`
  - `skills[name].computedHash`
- CLI contract:
  - `pnpm cli skills list`
  - `pnpm cli skills info <name>`
  - `pnpm cli skills verify`
  - `pnpm cli skills install --path <path>`
  - `pnpm cli skills install --repo <path-or-owner/repo> --name <skill-name>`
  - `pnpm cli skills remove <name>`

---

## Current State

Implemented: the reusable command family lives in `src/cli/skills/` as
`skills.ts` plus `command.ts`.

Implemented: installs support both direct local skill directories and repository
resolution from either a local repo path or `owner/repo` GitHub reference.

Implemented: destination metadata is tracked in a destination-local
`skills-lock.json`, which is also used to prevent accidental deletion of
untracked skill directories.

Implemented: `verify` recomputes hashes for tracked skills and reports `ok`,
`drifted`, or `missing`.

Implemented: `cli/index.ts` now registers the repo-level `pnpm cli skills`
entrypoint.

Verified: `pnpm exec vitest run src/cli/skills/skills.test.ts` and
`pnpm exec biome check cli/index.ts src/cli/skills/command.ts src/cli/skills/skills.ts src/cli/skills/skills.test.ts`
pass.

Not yet implemented: an explicit `update` command or remote registry lookup.
Reinstalling with `--force` is the current update path.

---

## What NOT To Do

- Do not assume `$CODEX_HOME` is set.
- Do not delete untracked user content by default.
- Do not auto-update or auto-prune skills on `list`.
- Do not use GitHub APIs when the local `git` binary is sufficient.
- Do not move this feature into `src/cli/dev-launcher/`.
