# [0018] Run dev actions inside the dev-launcher TUI

**Status:** `Implemented`

**Date:** 2026-03-27

---

## TL;DR

`pnpm cli dev` now exposes developer actions inside the Ink TUI. The TUI shows
current availability status for configured actions, lets the user run them from
an action picker, and honors `impactPolicy` by pausing managed services for
non-`parallel` actions and restoring the previous managed service set
afterward.

---

## Decision

The dev launcher keeps the CLI action commands (`pnpm cli action ...`), but no
longer treats them as the only execution surface. The Ink TUI now includes an
action picker opened with `x` from startup, dashboard, or focused-log mode.

The TUI action surface must provide:

- the configured action label
- current availability status
- the availability reason when one exists
- direct execution through `Enter`

When an action runs from inside the TUI:

- `parallel` actions run without changing the live session
- non-`parallel` actions pause the currently managed services first
- the previously managed service set is restored after the action finishes,
  regardless of success or failure

Action subprocesses launched from inside Ink must not write directly to the
real terminal via inherited stdio. The action runtime therefore captures
`inherit` requests as piped subprocess output when the TUI launches an action,
so Ink keeps control of the screen.

### Alternatives Considered

- **Keep actions CLI-only:** Rejected. It forces users to leave the live dev
  surface for repo maintenance workflows that are already part of the same
  local session.
- **Expose action status only, without execution:** Rejected. Availability
  without an immediate execution path is weak UX inside an interactive session.
- **Run non-`parallel` actions without pausing services:** Rejected. It ignores
  `impactPolicy` and risks mutating repo or dependency state while live
  services continue running.

---

## Constraints

- The TUI must remain the only in-session execution surface in this phase. Do
  not add nested action flows to the non-TTY plain runner.
- `impactPolicy` must be honored inside the live session.
- The action picker must reuse the shared config and existing action contract.
- Ink must retain control of the terminal while actions run from the TUI.

---

## Consequences

Positive: local maintenance workflows become available where the user already
manages services.

Positive: `impactPolicy` now has concrete in-session behavior instead of being
metadata only.

Negative: the TUI now owns additional async state for action availability and
execution.

Tech debt deferred or created: force-running unavailable actions from the TUI,
plain-runner action menus, and richer in-TUI action output panes remain out of
scope.

---

## Current State

Implemented: the TUI shows action availability summary text during startup,
dashboard, and focused-log mode.

Implemented: pressing `x` opens a modal action picker with availability status
and reasons.

Implemented: running a non-`parallel` action from the TUI stops managed
services and restores them afterward.

Implemented: the TUI action runtime captures inherited subprocess stdio so
action execution does not corrupt Ink rendering.

---

## Related ADRs

- ADR-0006 - Add a TypeScript-defined developer actions subsystem
- ADR-0017 - Use a shared TypeScript dev-launcher config and local recent
  selections
