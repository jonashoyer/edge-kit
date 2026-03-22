# Feature: Dev Launcher

**Status:** `Active`
**Last Reviewed:** 2026-03-22
**Related ADRs:** [ADR-0003], [ADR-0006], [ADR-0007], [ADR-0015]
**PRD:** N/A

---

## What This Does

`src/cli/dev-launcher/` provides a reusable, manifest-driven local
development launcher for single-package repos and PNPM monorepos. It loads an
explicit `dev-cli.config.json`, resolves root and workspace script targets,
supervises one child process per selected service, and exposes both a plain
runner and an Ink TUI with a focused single-service log mode for clean
copy/select behavior plus an optional per-service browser-open shortcut. It
also provides a separate TypeScript-defined actions subsystem for one-shot
developer tasks through `dev-cli.actions.ts` and the `pnpm cli action ...`
command family.

---

## Key Goals

- Keep local dev orchestration explicit and copy-paste ready.
- Support root scripts, workspace scripts, and raw commands without
  hardcoding one repo's service registry.
- Support repo-specific one-shot developer actions without hardcoding them into
  the service manifest or TUI.
- Ship reusable example actions from the dev-launcher feature while keeping the
  repo-root actions registry thin.
- Share one process supervisor across plain and TUI modes.
- Make the focused log view the supported copy/select surface in terminal mode.

---

## Implementation Constraints

- DO keep `dev-cli.config.json` as the source of truth for long-running
  services and presets.
- DO keep `dev-cli.actions.ts` / `.mts` / `.js` / `.mjs` as the separate local
  TS/JS source of truth for one-shot developer actions.
- DO keep shipped reusable example actions under
  `src/cli/dev-launcher/actions/` and expose them from the public entrypoint.
- DO use keyed maps as the config contract:
  - `servicesById`
  - `presetsById`
  - `actionsById`
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
- DO allow services to declare an optional `openUrl` that the TUI can open
  with a keyboard shortcut.
- DO provide plain-mode startup selection and non-TTY fallback.
- DO allow actions to define `suggestInDev`, `impactPolicy`, `isAvailable`,
  and `run` hooks through `defineDevActions(...)`.
- DO keep actions CLI-only in this phase.
- DO let `pnpm cli dev` print advisory preflight action suggestions without
  executing them or blocking startup.
- DO NOT add script auto-discovery, recent-preset persistence, auto-respawn,
  readiness checks, or persistent log files in this phase.
- DO NOT add a TUI action picker or action hotkeys in this phase.

---

## Public API / Contracts

- Manifest loader:
  - `loadDevLauncherManifest(...)`
  - `normalizeSelectedServiceIds(...)`
  - `getPresetServiceIds(...)`
- Actions:
  - `defineDevActions(...)`
  - `gitPullAction`
  - `installDepsAction`
  - `loadDevActionsConfig(...)`
  - `resolveDevActionsConfigPath(...)`
  - `listDevActions(...)`
  - `runDevAction(...)`
  - `getDevPreflightActionSuggestions(...)`
  - `getPnpmInstallState(...)`
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
  - `createDevLauncherActionCommand(...)`
  - `createDevLauncherCommand(...)`
  - `runDevActionListCommand(...)`
  - `runDevActionRunCommand(...)`
  - `runDevLauncherCommand(...)`

Manifest contract:

```json
{
  "version": 1,
  "packageManager": "pnpm",
  "servicesById": {
    "app": {
      "label": "App",
      "openUrl": "http://localhost:3000",
      "target": {
        "kind": "root-script",
        "script": "dev"
      }
    }
  },
  "presetsById": {},
  "ui": {
    "logBufferLines": 240
  }
}
```

Actions module contract:

```ts
import {
  defineDevActions,
  gitPullAction,
  installDepsAction,
} from './src/cli/dev-launcher';

export default defineDevActions({
  actionsById: {
    'git-pull': gitPullAction,
    'install-deps': installDepsAction,
  },
});
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
focused log mode that renders only the selected service log, and an `o`
shortcut that opens a selected service's configured `openUrl`.

Implemented: plain-mode startup prompts plus automatic non-TTY fallback.

Implemented: example repo command surface through `pnpm cli dev`.

Implemented: a TS/JS actions registry loader with upward lookup and
`--actions-config` override support for `.ts`, `.mts`, `.js`, and `.mjs`
files.

Implemented: CLI-only action listing and execution through
`pnpm cli action list` and `pnpm cli action run <id>`.

Implemented: `pnpm cli dev` now evaluates only `suggestInDev` actions and
prints non-blocking preflight suggestions before entering TUI or plain mode.

Implemented: the repo ships `dev-cli.actions.ts` as a thin repo-root registry,
with `gitPullAction` and `installDepsAction` implemented under
`src/cli/dev-launcher/actions/` and exported from the public entrypoint.

---

## What NOT To Do

- Do not reintroduce a hardcoded service registry as the only supported config
  model.
- Do not mix repo-specific business logic into `src/cli/dev-launcher/`.
- Do not treat the split dashboard as the clean copy/select surface.
- Do not infer services from `package.json` or `pnpm-workspace.yaml` in v1.
- Do not move one-shot actions into `dev-cli.config.json`.
- Do not hardcode install, migration, or database workflows into
  `pnpm cli dev`; define them as actions instead.
- Do not add remote action/plugin loading in this phase.
- Do not add local recent-preset storage or auto-restart loops without a new
  ADR.
