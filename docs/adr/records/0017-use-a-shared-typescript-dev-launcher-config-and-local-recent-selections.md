# [0017] Use a shared TypeScript dev-launcher config and local recent selections

**Status:** `Implemented`

**Date:** 2026-03-27

---

## TL;DR

The dev launcher now uses one shared TypeScript config file,
`dev-cli.config.ts` (or `.mts` / `.js` / `.mjs`), for both long-running
services and one-shot developer actions. `presetsById` is removed. The startup
selector now shows recent user-local service selections by rendered service
labels, and the TUI layout stretches to the full terminal height.

---

## Decision

The dev-launcher feature keeps its explicit, copy-paste-friendly configuration
model, but collapses the repo contract to a single TS/JS config surface:

- `dev-cli.config.ts`
- `dev-cli.config.mts`
- `dev-cli.config.js`
- `dev-cli.config.mjs`

That shared config default-exports an object created by
`defineDevLauncherConfig(...)` and contains:

- `version`
- `packageManager`
- `servicesById`
- optional `actionsById`
- optional `ui`

`presetsById` is removed from the public contract.

The startup selector in both TUI and plain mode now derives from recent service
selections saved in a user-local state file keyed by repo root. These recent
selections are:

- best-effort persisted
- not committed to the repo
- rendered only as the labels of the services in that saved selection
- always accompanied by a `Custom selection` escape hatch

The shared config is now the only file used by:

- `pnpm cli dev`
- `pnpm cli action list`
- `pnpm cli action run <id>`

The action command family keeps its existing behavior, but its optional path
override is now `--config <path>` so both command families reference the same
config file.

The TUI layout now uses full terminal height. The dashboard log panel and
focused log view both scale their visible log window from terminal rows instead
of using a fixed content height.

### Alternatives Considered

- **Keep `dev-cli.config.json` plus `dev-cli.actions.ts`:** Rejected. The split
  contract no longer buys enough separation to justify the extra loader,
  duplicated path flags, and stale docs/tests.
- **Keep presets but also add recent selections:** Rejected. That creates two
  competing startup abstractions when the requirement is explicitly
  user-history-driven selection.
- **Persist recent selections in repo config or gitignored repo files:**
  Rejected. Recent selections are user-specific UX state, not shared launcher
  definition.

---

## Constraints

- The launcher must keep explicit service declarations. Do not add script
  auto-discovery.
- Shared config remains TS/JS-defined. Do not reintroduce a separate actions
  registry file.
- Recent selections must remain user-local, best-effort UX state. They must
  not become repo-shared config.
- The startup selector must render recent configurations by service labels only.
- The TUI must continue to support focused single-service log mode as the clean
  copy/select surface.

---

## Consequences

Positive: repo setup is simpler because there is one config file to discover,
document, and override.

Positive: startup UX is better aligned with repeated local workflows because it
defaults to recent selections instead of hardcoded repo presets.

Negative: this is a breaking config change for any in-progress adopters of the
old `dev-cli.config.json` plus `dev-cli.actions.ts` contract.

Tech debt deferred or created: recent-selection syncing across machines,
team-shared startup profiles, and richer persisted session metadata remain out
of scope.

---

## Current State

Implemented: the repo now ships `dev-cli.config.ts` as the only dev-launcher
config entrypoint.

Implemented: manifest/config loading imports the shared TS/JS module and
validates both services and actions.

Implemented: `pnpm cli dev` no longer exposes `--preset`, and
`pnpm cli action ...` now uses the same `--config` override surface.

Implemented: recent service selections are stored in a local per-user state
file keyed by repo root and used by both the Ink TUI and plain prompt flow.

Implemented: the Ink dashboard and focused log view now occupy the full
terminal height.

---

## User Flow / Public API / Contract Changes

Before:

- `dev-cli.config.json` defined services and presets
- `dev-cli.actions.ts` defined actions
- startup selection was preset-driven

After:

```ts
export default defineDevLauncherConfig({
  actionsById: {
    'install-deps': installDepsAction,
  },
  packageManager: 'pnpm',
  servicesById: {
    app: {
      label: 'App',
      target: {
        kind: 'root-script',
        script: 'dev',
      },
    },
  },
  version: 1,
});
```

CLI changes:

```bash
pnpm cli dev
pnpm cli dev --config ./dev-cli.config.ts
pnpm cli dev --services app,api
pnpm cli action list
pnpm cli action run install-deps
pnpm cli action --config ./dev-cli.config.ts list
```

---

## Related ADRs

- ADR-0003 - Use a manifest-driven dev launcher for repo and monorepo scripts
- ADR-0006 - Add a TypeScript-defined developer actions subsystem
- ADR-0007 - Use keyed id maps for dev-launcher services, presets, and actions
- ADR-0015 - Ship dev-launcher example actions from the feature directory
