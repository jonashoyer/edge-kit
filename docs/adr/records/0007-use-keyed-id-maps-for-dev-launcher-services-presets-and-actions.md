# [0007] Use keyed id maps for dev-launcher services, presets, and actions

**Status:** `Implemented`

**Date:** 2026-03-18

---

## TL;DR

The dev launcher now uses keyed maps as the single config shape for services,
presets, and actions. `dev-cli.config.json` uses `servicesById` and
`presetsById`, `dev-cli.actions.ts` uses `actionsById`, and id values are no
longer duplicated inside each object. Order is derived from object insertion
order. The repo example action implementation also moves into `dev-cli/actions/`
with the root `dev-cli.actions.ts` file kept as a thin entrypoint.

---

## Decision

The generic dev-launcher feature standardizes on one collection pattern for all
id-addressed registries:

- `servicesById`
- `presetsById`
- `actionsById`

Each registry uses the object key as the id. The value object contains the rest
of the configuration and does not repeat the id field.

Runtime code may still derive ordered id lists such as `serviceIdsInOrder`,
`presetIdsInOrder`, and `actionIdsInOrder`, but these are computed views rather
than separately configured collections.

This change applies to both public config surfaces:

- `dev-cli.config.json`
- `dev-cli.actions.ts`

The actions entrypoint contract remains rooted at `dev-cli.actions.ts`, but the
repo example should keep individual action modules in a nested folder for
organization, with the root file acting as a thin re-export or registry
assembly point.

### Alternatives Considered

- **Keep arrays plus derived id maps internally:** Rejected. It preserves
  duplicated state and forces every config consumer to keep `id` fields and
  keyed lookups in sync.
- **Use arrays publicly but maps only for actions:** Rejected. The feature
  should pick one mental model instead of mixing collection styles across
  closely related configs.
- **Infer order from sorted keys:** Rejected. Insertion order should reflect the
  author’s declared order without adding another explicit order field in this
  phase.

---

## Constraints

- `dev-cli.config.json` must use keyed maps for services and presets.
- `dev-cli.actions.ts` must use a keyed map for actions.
- Runtime code may derive ordered id arrays, but it must not treat duplicated
  arrays of config objects as source of truth.
- The root `dev-cli.actions.ts` entrypoint remains the default lookup target,
  even when the real action modules are organized under `dev-cli/actions/`.

---

## Consequences

Positive: the config model is simpler, drier, and easier to reason about.

Positive: services, presets, and actions now follow one consistent lookup and
authoring pattern.

Negative: this is a breaking config change for any in-progress adopters of the
earlier array-based examples.

Tech debt deferred or created: if future UX requires explicit reordering beyond
object insertion order, that should be introduced deliberately in a later ADR
rather than by reintroducing duplicated array state.

---

## Current State

Implemented: manifest loading, action loading, plain-mode selection, and the
Ink TUI now consume keyed maps and derive ordered ids from insertion order.

Implemented: the repo example config files now use `servicesById`,
`presetsById`, and `actionsById`, and the example install action lives under
`dev-cli/actions/`.

---

## Related ADRs

- ADR-0003 - Use a manifest-driven dev launcher for repo and monorepo scripts
- ADR-0006 - Add a TypeScript-defined developer actions subsystem
