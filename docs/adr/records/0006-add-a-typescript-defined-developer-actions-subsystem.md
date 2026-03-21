# [0006] Add a TypeScript-defined developer actions subsystem

**Status:** `Implemented`

**Date:** 2026-03-18

---

## TL;DR

Edge Kit extends the reusable `src/cli/dev-launcher/` feature with a separate
TypeScript-first actions subsystem for one-shot developer tasks such as
dependency installs, database pushes, and migrations. Long-running services and
presets remain in `dev-cli.config.json`, while developer-defined actions live in
`dev-cli.actions.ts` (or `.mts` / `.js` / `.mjs`) so availability checks and
execution can use local JS/TS logic instead of declarative shell-only config.

---

## Decision

The dev launcher keeps its current manifest-driven model for long-running
services and presets, but adds a second, explicit config surface for developer
actions.

Services and presets remain owned by `dev-cli.config.json`.

Actions are defined in a separate local module that is searched upward from the
current working directory unless overridden explicitly:

- `dev-cli.actions.ts`
- `dev-cli.actions.mts`
- `dev-cli.actions.js`
- `dev-cli.actions.mjs`

The actions module exports a default registry created through
`defineDevActions({ actions: [...] })`.

Each action definition includes:

- `id`
- `label`
- optional `description`
- optional `suggestInDev`
- `impactPolicy` as `'parallel' | 'stop-selected' | 'stop-all'`
- optional `isAvailable(ctx)`
- required `run(ctx)`

Unlike services, actions are intentionally JS/TS-defined in v1. Their
availability and execution logic may inspect repo state, run commands, or apply
 local workflow rules through a safe runtime context. The context exposes:

- repo root and config paths
- the parsed service manifest
- `exec(...)` for subprocess execution
- `pnpm(...)` as a package-manager-aware shortcut
- structured output helpers for user-facing CLI messages

The repo-level CLI adds a new command family:

```bash
pnpm cli action list
pnpm cli action list --json
pnpm cli action run <id>
pnpm cli action run <id> --force
pnpm cli action --actions-config <path> ...
```

`action list` evaluates every action and reports availability plus reasons.
`action run` evaluates availability first and refuses unavailable actions unless
`--force` is passed.

`pnpm cli dev` remains focused on long-running services. In this phase it may
evaluate only `suggestInDev: true` actions before startup and print advisory
messages such as:

```text
Action available before starting services: install-deps
Run pnpm cli action run install-deps
```

The `impactPolicy` field is part of the generic action model now, but it is
metadata only in this phase. Standalone `action run` does not coordinate a live
dev session, and `dev` does not stop or restart services based on action state.

The first shipped example action is `install-deps`, backed by a reusable PNPM
package-state helper that determines whether an install is needed.

### Alternatives Considered

- **Keep everything in one JSON manifest:** Rejected. One-shot actions need
  developer-owned logic for availability checks and execution hooks, which would
  become awkward or unsafe in a declarative JSON-only format.
- **Add actions directly into the TUI dashboard:** Rejected for this phase.
  Actions are short-lived and operationally different from supervised dev
  services, so v1 keeps the TUI focused on service management.
- **Use shell-command action definitions only:** Rejected. The required DX
  depends on repo-aware predicates and reusable helpers, not just static shell
  snippets.
- **Hardcode install / migration behavior into `pnpm cli dev`:** Rejected.
  These should be generic, configurable actions rather than repository-specific
  special cases embedded in the launcher.

---

## Constraints

- `src/cli/dev-launcher/` remains the reusable home for this feature. Do not
  move dev-launcher logic into `src/services/`.
- `dev-cli.config.json` remains the explicit source of truth for services and
  presets.
- Actions must be defined through a local TS/JS module. Do not add remote
  plugin loading or network-fetched action registries.
- `pnpm cli dev` may only suggest opted-in actions in this phase. It must not
  execute them automatically and must not block service startup on them.
- The TUI remains service-focused. Do not add action menus or action hotkeys in
  this phase.
- `impactPolicy` must be modeled now even though standalone action execution
  does not yet coordinate with live supervised services.
- The first example action must be dependency installation. Database and
  migration actions are documented as examples unless a repo has stable scripts
  ready to wire in.

---

## Consequences

Positive: the generic launcher can now express repo-specific maintenance and
preflight workflows without hardcoding them into the TUI or the service
manifest.

Positive: developer experience improves because actions can use ordinary
TypeScript for availability checks, command orchestration, and helpful output.

Negative: the feature now owns two config surfaces, which increases
documentation, validation, and testing requirements.

Tech debt deferred or created: live coordination between actions and an already
running dev session is intentionally deferred to a later ADR, as are action
history, recent presets, and non-PNPM package-manager helpers.

---

## Assumptions and Defaults

- Assumes long-running services and one-shot actions are different enough to
  justify separate config models.
- Assumes `tsx` remains the CLI runtime, so local TS action modules can be
  imported dynamically without a separate build step.
- Assumes repositories want a generic escape hatch for tasks such as installs,
  database pushes, and migrations, but not a remote plugin ecosystem.
- Assumes PNPM remains the default package-manager shortcut in this phase, even
  though `exec(...)` is available for arbitrary commands.

---

## Current State

Implemented: `src/cli/dev-launcher/` now includes a TS-defined actions
registry, actions config lookup/import, reusable action execution helpers, and
CLI surfaces for listing and running actions.

Implemented: `pnpm cli dev` evaluates only `suggestInDev` actions and prints
non-blocking preflight suggestions while keeping the TUI and plain session
service-focused.

Implemented: the repo ships `dev-cli.actions.ts` with an `install-deps` action
backed by a reusable PNPM install-state helper, plus tests and docs for the new
split config model.

---

## User Flow / Public API / Contract Changes

Before:

- The dev launcher has one config file, `dev-cli.config.json`, for services and
  presets.
- There is no generic contract for one-shot developer actions.

After:

- Services and presets stay in:

```json
{
  "version": 1,
  "packageManager": "pnpm",
  "services": [],
  "presets": []
}
```

- Actions are defined in a separate TS/JS module:

```ts
export default defineDevActions({
  actions: [
    {
      id: 'install-deps',
      label: 'Install dependencies',
      suggestInDev: true,
      impactPolicy: 'stop-all',
      async isAvailable(ctx) {
        return { available: true, reason: 'Dependencies are stale.' };
      },
      async run(ctx) {
        await ctx.pnpm(['install'], { stdio: 'inherit' });
      },
    },
  ],
});
```

- New CLI contracts:

```bash
pnpm cli dev --actions-config ./dev-cli.actions.ts
pnpm cli action list
pnpm cli action list --json
pnpm cli action run install-deps
pnpm cli action run install-deps --force
```

---

## Related ADRs

- ADR-0003 - Use a manifest-driven dev launcher for repo and monorepo scripts
