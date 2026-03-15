# [0003] Use a manifest-driven dev launcher for repo and monorepo scripts

**Status:** `Implemented`

**Date:** 2026-03-14

---

## TL;DR

Edge Kit now includes a reusable `src/cli/dev-launcher/` module family plus
an example `pnpm cli dev` command that launches local development stacks from
an explicit `dev-cli.config.json` manifest. This is chosen to keep the
launcher copy-paste ready across single-package repos and PNPM monorepos
without hardcoding one repo's scripts, and future work must preserve explicit
manifest ownership rather than add auto-discovery in this phase.

---

## Decision

Local development orchestration is implemented as a dedicated reusable
CLI module family under `src/cli/dev-launcher/`, with a separate example CLI
entrypoint in `cli/index.ts` that exposes `pnpm cli dev` for this repository.
The launcher will be manifest-driven: it reads `dev-cli.config.json` by
searching upward from the current working directory unless `--config <path>` is
provided explicitly.

The manifest contract for v1 is:

- `version: 1`
- `packageManager: "pnpm"`
- `services: []`
- `presets: []`
- optional `ui.logBufferLines`

Each service is declared explicitly using one of three target kinds:

- `root-script` with `script`
- `workspace-script` with `script` and exactly one of `packageName` or
  `packagePath`
- `command` with `command`, optional `args`, and optional `cwd`

The runtime will supervise one child process per selected service, preserve
bounded in-memory logs with lifecycle markers, and support both a plain
fallback runner and an Ink TUI. The TUI remains terminal-only in v1, but clean
copy/select behavior for one service log is handled by a focused single-service
log mode that renders no sidebar or dashboard text while active.

No script or workspace auto-discovery is allowed in this phase. The manifest is
the source of truth for what services, presets, and labels the launcher
surfaces.

### Alternatives Considered

- **Hardcoded service registry in the CLI:** Rejected — it would mirror the
  Lexsee-specific approach and make the feature far less reusable across
  unrelated repos.
- **Auto-discovery from `package.json` and workspace files:** Rejected — it
  reduces setup cost but introduces unstable heuristics and weaker control over
  public launcher behavior.
- **Browser or local-web log viewer:** Rejected — v1 is intentionally kept
  terminal-only to stay lighter-weight and easier to copy-paste into other
  codebases.

---

## Constraints

- `src/cli/dev-launcher/` must stay reusable, dependency-light, and not
  import repo-specific business logic.
- The example command in `cli/index.ts` is a consumer of the generic launcher;
  it must not become the only place where core launcher logic lives.
- `dev-cli.config.json` is the only supported source of service definitions in
  v1. Do not add automatic script discovery, inferred presets, or dynamic
  workspace scanning as a user-facing feature.
- `workspace-script` targets must resolve from explicit `packageName` or
  `packagePath`; do not allow ambiguous workspace matches.
- The process supervisor must run one child per selected service and keep
  unchanged healthy services running when the managed set changes.
- Unexpected service exits must transition to `failed`; do not add automatic
  respawn loops in v1.
- The TUI must support a focused single-service log mode with isolated scroll
  state and no sidebar text in the active render. Do not treat the split
  dashboard view as the supported copy/select surface.
- The launcher must continue to work in non-interactive environments through a
  plain fallback mode and `--no-tui`.
- Existing MCP entrypoints under `cli/mcp.ts` and `cli/cli-mcp.ts` remain
  separate and must not be folded into the dev launcher.

---

## Consequences

Positive: Edge Kit gains a reusable dev orchestration primitive that can target
single-package repos and PNPM monorepos without coupling the service list to
one project layout.

Negative: The repo takes on a new CLI/TUI dependency surface and a manifest
contract that must be documented, validated, and tested carefully.

Tech debt deferred or created: Auto-discovery, shared team presets, browser
log viewers, readiness checks, dependency graphs, and persistent log files are
explicitly deferred to later ADRs if they are needed.

---

## Assumptions and Defaults

- Assumes PNPM is the default package manager for script-based targets in this
  phase.
- Assumes raw command targets are needed as an escape hatch for tools that are
  not best expressed as package scripts.
- Assumes terminal-based focused log rendering is sufficient for clean
  copy/select without adding a browser UI in v1.
- Assumes repos may be launched from either the root or a nested workspace
  directory, so config lookup and workspace resolution must support both.

---

## Current State

Implemented: `src/cli/dev-launcher/` now owns manifest loading,
workspace/root resolution, process supervision, plain-mode startup flow, and
the Ink TUI with focused log mode.

Implemented: `cli/index.ts`, `package.json` scripts, and
`dev-cli.config.json` expose the example `pnpm cli dev` command for this repo.

Implemented: tests cover manifest validation, repo resolution, process-manager
behavior, CLI mode selection, and focused log mode behavior.

---

## User Flow / Public API / Contract Changes

Before:

- Edge Kit has MCP-oriented CLI entrypoints only.
- There is no generic dev launcher contract for repo or monorepo scripts.

After:

- New config file:

```json
{
  "version": 1,
  "packageManager": "pnpm",
  "services": [],
  "presets": []
}
```

- New example CLI contract:

```bash
pnpm cli dev
pnpm cli dev --config ./dev-cli.config.json
pnpm cli dev --preset web
pnpm cli dev --services app,api
pnpm cli dev --no-tui
```

- New target contract per service:

```ts
type DevServiceTarget =
  | { kind: 'root-script'; script: string }
  | {
      kind: 'workspace-script';
      script: string;
      packageName?: string;
      packagePath?: string;
    }
  | { kind: 'command'; command: string; args?: string[]; cwd?: string };
```

- New TUI behavior:
  - startup preset/custom selection
  - split dashboard for overview
  - focused single-service log mode entered from the selected service
  - plain fallback for non-TTY or `--no-tui`

---

## Related ADRs

- ADR-0002 — Add contextualizer, richer storage, and AI runtime support
