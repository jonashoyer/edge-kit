# Feature: Dev Launcher

**Status:** `Active`
**Last Reviewed:** 2026-03-14
**Related ADRs:** [ADR-0003]
**PRD:** N/A

---

## What This Does

`src/cli/dev-launcher/` provides a reusable, manifest-driven local
development launcher for single-package repos and PNPM monorepos. It loads an
explicit `dev-cli.config.json`, resolves root and workspace script targets,
supervises one child process per selected service, and exposes both a plain
runner and an Ink TUI with a focused single-service log mode for clean
copy/select behavior.

---

## Key Goals

- Keep local dev orchestration explicit and copy-paste ready.
- Support root scripts, workspace scripts, and raw commands without
  hardcoding one repo's service registry.
- Share one process supervisor across plain and TUI modes.
- Make the focused log view the supported copy/select surface in terminal mode.

---

## Implementation Constraints

- DO treat `dev-cli.config.json` as the only v1 source of truth for services
  and presets.
- DO keep the reusable runtime in `src/cli/dev-launcher/`; `cli/index.ts`
  is only an example consumer.
- DO support exactly three target kinds in v1:
  - `root-script`
  - `workspace-script`
  - `command`
- DO require `workspace-script` to use exactly one of `packageName` or
  `packagePath`.
- DO supervise one child per selected service and keep unchanged healthy
  services running when the managed set changes.
- DO preserve bounded in-memory logs and inject lifecycle markers for start,
  stop, fail, and restart events.
- DO provide a focused single-service log mode with no sidebar text while it is
  active.
- DO provide plain-mode startup selection and non-TTY fallback.
- DO NOT add script auto-discovery, recent-preset persistence, auto-respawn,
  readiness checks, or persistent log files in this phase.

---

## Public API / Contracts

- Manifest loader:
  - `loadDevLauncherManifest(...)`
  - `normalizeSelectedServiceIds(...)`
  - `getPresetServiceIds(...)`
- Repo/workspace helpers:
  - `resolveDevLauncherConfigPath(...)`
  - `listWorkspacePackageDirectories(...)`
  - `resolveWorkspacePackageDirectoryByName(...)`
  - `resolveWorkspacePackageDirectoryByPath(...)`
- Runtime:
  - `DevLauncherProcessManager`
  - `buildDevLauncherSpawnSpec(...)`
- Session runners:
  - `runPlainDevSession(...)`
  - `startDevLauncherTuiSession(...)`
- Example command factory:
  - `createDevLauncherCommand(...)`
  - `runDevLauncherCommand(...)`

Manifest contract:

```json
{
  "version": 1,
  "packageManager": "pnpm",
  "services": [],
  "presets": [],
  "ui": {
    "logBufferLines": 240
  }
}
```

---

## Current State

Implemented: explicit manifest loading with upward config lookup and optional
`--config` override.

Implemented: root-script, workspace-script, and command target resolution for
single-package repos and PNPM workspaces.

Implemented: a shared process supervisor with one child per service, bounded
log buffers, lifecycle markers, and explicit stop/restart behavior.

Implemented: a terminal TUI with startup preset selection, split dashboard,
and focused log mode that renders only the selected service log.

Implemented: plain-mode startup prompts plus automatic non-TTY fallback.

Implemented: example repo command surface through `pnpm cli dev`.

---

## What NOT To Do

- Do not reintroduce a hardcoded service registry as the only supported config
  model.
- Do not mix repo-specific business logic into `src/cli/dev-launcher/`.
- Do not treat the split dashboard as the clean copy/select surface.
- Do not infer services from `package.json` or `pnpm-workspace.yaml` in v1.
- Do not add local recent-preset storage or auto-restart loops without a new
  ADR.
