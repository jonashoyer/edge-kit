# Feature: Dev Launcher

**Status:** `Active`
**Last Reviewed:** 2026-03-27
**Related ADRs:** [ADR-0003], [ADR-0006], [ADR-0007], [ADR-0015], [ADR-0017], [ADR-0018], [ADR-0019]
**PRD:** N/A

---

## What This Does

`src/cli/dev-launcher/` provides a reusable local development launcher for
single-package repos and PNPM monorepos. It loads an explicit shared TS/JS dev
config, resolves root and workspace script targets, supervises one child
process per selected service, exposes a single local session host over a Unix
domain socket, supports attachable plain/TUI clients, and supports one-shot
developer actions from the same config file.

The startup UX is now driven by recent user-local service selections rather
than repo-defined presets. The TUI also provides a focused single-service log
mode, live action availability/status, in-session action execution, and uses
the full terminal height.

---

## Key Goals

- Keep local dev orchestration explicit and copy-paste ready.
- Support root scripts, workspace scripts, and raw commands without
  hardcoding one repo's service registry.
- Support repo-specific one-shot developer actions without hardcoding them into
  CLI entrypoints.
- Share one process supervisor across plain and TUI modes and thin CLI control
  commands.
- Make the focused log view the supported copy/select surface in terminal mode.
- Make startup faster for repeated local workflows through recent selections.
- Keep repo maintenance actions available inside the live TUI session.
- Make the running launcher session addressable for both humans and agents.

---

## Implementation Constraints

- DO keep `dev-cli.config.ts` / `.mts` / `.js` / `.mjs` as the single source
  of truth for services, optional actions, and UI config.
- DO use keyed maps as the config contract:
  - `servicesById`
  - optional `actionsById`
- DO keep shipped reusable example actions under
  `src/cli/dev-launcher/actions/` and import them directly from their concrete
  modules.
- DO keep the reusable runtime in `src/cli/dev-launcher/`; `cli/index.ts`
  is only an example consumer.
- DO keep one live session host per repo root in user-local state.
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
- DO expose the live supervisor through JSON-RPC 2.0 on a Unix domain socket.
- DO provide a focused single-service log mode with no sidebar text while it is
  active.
- DO allow services to declare an optional `openUrl` that the TUI can open
  with a keyboard shortcut.
- DO let startup selection show recent user-local service selections by service
  label only, plus a `Custom selection` escape hatch.
- DO persist recent service selections only as best-effort local user state.
- DO allow configs with zero actions defined.
- DO show action availability status inside the TUI.
- DO allow the TUI to run configured actions via an action picker.
- DO allow actions to declare optional explicit one-character TUI hotkeys.
- DO honor `impactPolicy` in the TUI by pausing managed services for
  non-`parallel` actions and restoring the prior managed set afterward.
- DO keep action subprocess output from corrupting Ink rendering.
- DO keep read-only session commands side-effect free when no session exists.
- DO auto-bootstrap only mutating service commands, and only through the
  macOS Terminal bootstrap flow in this phase.
- DO keep `--json` as the stable machine-readable CLI output contract and
  scope `--toon` to non-streaming CLI rendering only.
- DO let `pnpm cli dev` print advisory preflight action suggestions without
  executing them or blocking startup.
- DO NOT reintroduce repo-defined presets or a separate actions registry file.
- DO NOT store recent selections in repo config or other repo-shared files.
- DO NOT add script auto-discovery, auto-respawn, readiness checks, or
  persistent log files in this phase.
- DO NOT add action flows to the non-TTY plain runner in this phase.
- DO NOT add HTTP, MCP, or push-based log subscriptions in this phase.

---

## Public API / Contracts

- Config:
  - `defineDevLauncherConfig(...)`
  - `loadDevLauncherConfig(...)`
  - `loadDevLauncherManifest(...)`
  - `normalizeSelectedServiceIds(...)`
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
- Local state:
  - `loadRecentDevServiceSelections(...)`
  - `saveRecentDevServiceSelection(...)`
  - `resolveDevLauncherSelectionHistoryPath(...)`
  - `resolveDevLauncherSessionMetadataPath(...)`
  - `resolveDevLauncherSocketPath(...)`
  - `resolveReachableDevLauncherSession(...)`
- Repo/workspace helpers:
  - `resolveDevLauncherConfigPath(...)`
  - `listWorkspacePackageDirectories(...)`
  - `resolveWorkspacePackageDirectoryByName(...)`
  - `resolveWorkspacePackageDirectoryByPath(...)`
- Runtime:
  - `DevLauncherProcessManager`
  - `buildDevLauncherSpawnSpec(...)`
- Session host / client:
  - `DevLauncherSessionServer`
  - `DevLauncherSessionClient`
  - `DevLauncherRemoteProcessController`
- Session runners:
  - `runPlainDevSession(...)`
  - `startDevLauncherTuiSession(...)`
- Example command factory:
  - `createDevLauncherActionCommand(...)`
  - `createDevLauncherCommand(...)`
  - `runDevActionListCommand(...)`
  - `runDevActionRunCommand(...)`
  - `runDevLauncherCommand(...)`
  - `runDevLauncherAttachCommand(...)`
  - `runDevLauncherHostCommand(...)`
  - `runDevLauncherStatusCommand(...)`
  - `runDevLauncherLogsCommand(...)`

Shared config contract:

```ts
export default defineDevLauncherConfig({
  actionsById: {
    'install-deps': installDepsAction,
  },
  packageManager: 'pnpm',
  servicesById: {
    app: {
      label: 'App',
      openUrl: 'http://localhost:3000',
      target: {
        kind: 'root-script',
        script: 'dev',
      },
    },
  },
  ui: {
    logBufferLines: 240,
  },
  version: 1,
});
```

---

## Current State

Implemented: shared TS/JS config loading with upward lookup and optional
`--config` override.

Implemented: root-script, workspace-script, and command target resolution for
single-package repos and PNPM workspaces.

Implemented: a shared process supervisor with one child per service, bounded
log buffers, lifecycle markers, and explicit stop/restart behavior.

Implemented: one local session host per repo root now owns the shared process
supervisor and exposes JSON-RPC 2.0 over a Unix domain socket.

Implemented: a terminal TUI with recent-selection startup flow, split
dashboard, focused log mode that renders only the selected service log, full
terminal-height layout, an `o` shortcut that opens a selected service's
configured `openUrl`, and an `x` action picker that shows availability status
and can run configured actions.

Implemented: plain-mode startup prompts plus automatic non-TTY fallback.

Implemented: example repo command surface through `pnpm cli dev`.

Implemented: `pnpm cli dev` now starts a foreground session host when no
session exists, attaches to an existing session when one is already running,
and can apply `--services` through the live session instead of spawning a
duplicate supervisor.

Implemented: `pnpm cli dev host --headless`, `attach`, `status`, `logs`,
`service ...`, `services apply`, and `session stop` are all thin clients of the
same socket-backed session API.

Implemented: CLI action listing and execution through
`pnpm cli action list` and `pnpm cli action run <id>`.

Implemented: `pnpm cli dev` evaluates only `suggestInDev` actions and prints
non-blocking preflight suggestions before entering TUI or plain mode.

Implemented: recent service selections are stored in local per-user state and
reused in both TUI and plain startup flows.

Implemented: actions can now declare explicit one-character TUI hotkeys for
direct execution outside the action picker.

Implemented: non-`parallel` actions launched from the TUI now stop managed
services first and restore the prior managed set afterward.

Implemented: mutating service commands auto-bootstrap a headless session host
through Terminal.app on macOS when no session exists. Read-only commands fail
fast with `no_session`.

Implemented: structured CLI commands support `--json` and `--toon`; TOON is a
CLI rendering mode only and is not part of the socket protocol.

---

## What NOT To Do

- Do not reintroduce a hardcoded service registry as the only supported config
  model.
- Do not split services and actions back across two repo-root config files.
- Do not treat the split dashboard as the clean copy/select surface.
- Do not infer services from `package.json` or `pnpm-workspace.yaml` in v1.
- Do not store recent user selections inside `dev-cli.config.ts`.
- Do not hardcode install, migration, or database workflows into
  `pnpm cli dev`; define them as actions instead.
- Do not let TUI-triggered actions write directly to the live terminal outside
  Ink.
- Do not make the TUI process the only owner of service supervision anymore.
- Do not add alternate runtime transports before the socket session API is
  proven.
- Do not add remote action/plugin loading in this phase.
