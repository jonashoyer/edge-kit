# [0015] Ship dev-launcher example actions from the feature directory

**Status:** `Implemented`

**Date:** 2026-03-22

---

## TL;DR

Edge Kit keeps `dev-cli.actions.ts` as the repo-root actions registry contract,
but moves shipped example action implementations into
`src/cli/dev-launcher/actions/` and imports them directly from concrete
modules. This replaces the earlier repo-specific example placement under
`dev-cli/actions/` while preserving the loader contract and action runtime
behavior.

---

## Decision

Shipped reusable example actions for the dev launcher live inside the feature
directory that owns the action runtime:

- `src/cli/dev-launcher/actions/`

The repo-root registry contract remains unchanged:

- `dev-cli.actions.ts`
- `dev-cli.actions.mts`
- `dev-cli.actions.js`
- `dev-cli.actions.mjs`

`dev-cli.actions.ts` remains the thin assembly point discovered by the loader.
It imports shipped example actions from their concrete dev-launcher modules
rather than from a repo-only directory.

This decision adds public exports for shipped example actions such as:

- `gitPullAction`
- `installDepsAction`

The example action remains generic and reusable. Repo-specific workflow logic
that is not appropriate for copy-paste reuse still belongs outside the
dev-launcher feature.

### Alternatives Considered

- **Keep shipped example actions under `dev-cli/actions/`:** Rejected. That
  keeps feature-owned example code outside the feature directory and blurs the
  copy-paste story for consumers.
- **Move the example under `src/cli/dev-launcher/` but keep it off the public
  entrypoint:** Rejected. The intended consumption pattern for the shipped
  example should be explicit and stable.
- **Move all actions into the JSON manifest or loader defaults:** Rejected.
  The TS-defined actions registry remains the correct contract for actions with
  availability and execution logic.

---

## Constraints

- Keep `dev-cli.actions.ts` as the default upward-discovered registry contract.
- Keep shipped reusable example actions under `src/cli/dev-launcher/`.
- Keep shipped example actions under concrete files in
  `src/cli/dev-launcher/actions/`.
- Do not move repo-specific, non-generic workflow logic into the reusable
  feature directory.
- Do not change `actionsById`, `suggestInDev`, `impactPolicy`, or action
  execution semantics as part of this relocation.

---

## Consequences

Positive: feature-owned example actions now live with the feature that defines
their types, helpers, and public API.

Positive: the README and example registry setup become simpler because
consumers can import `defineDevActions` and shipped example actions from stable
concrete modules without relying on a barrel entrypoint.

Negative: ADR-0007 is no longer fully current about where shipped example
actions live, so this ADR supersedes that placement decision.

---

## Assumptions and Defaults

- Assumes `gitPullAction` and `installDepsAction` are generic enough to remain
  part of the reusable dev-launcher feature.
- Assumes repositories still own the root actions registry and decide which
  shipped or custom actions to include.
- Assumes additional shipped example actions, if added later, should follow the
  same `src/cli/dev-launcher/actions/` plus public-export pattern unless a new
  ADR says otherwise.

---

## Implementation Notes

Implemented in this repo by:

- moving the shipped install example into `src/cli/dev-launcher/actions/`
- adding shipped reusable example actions under
  `src/cli/dev-launcher/actions/`
- wiring consumers to import `gitPullAction` and `installDepsAction` from
  their concrete modules
- updating `dev-cli.actions.ts`, tests, README, and feature docs to use direct
  imports

---

## Related ADRs

- [ADR-0003] Use a manifest-driven dev launcher for repo and monorepo scripts
- [ADR-0006] Add a TypeScript-defined developer actions subsystem
- [ADR-0007] Use keyed id maps for dev-launcher services, presets, and actions
