# Edge Kit Development Doctrine

## Mental Model

Edge Kit is a toolkit of modules that should survive being copied into another
codebase. That changes the default engineering tradeoffs.

The main optimization target is not “beautiful package ergonomics.” It is:

- explicit structure
- low coupling
- minimal dependencies
- honest boundaries
- easy liftovers

If a decision improves local convenience but makes copied usage murkier, it is
usually the wrong decision here.

## Correct Development Flow

1. Read the relevant repo constraints before coding.
2. Decide the file boundary and ownership first.
3. Reuse repo primitives before adding new abstractions.
4. Implement the smallest correct module set.
5. Add colocated tests.
6. Update feature docs and README discoverability when the surface changes.
7. If the change is architectural or cross-cutting, complete the DocDD flow.

## Placement Heuristics

### Put code in `src/utils/` when:

- the helper is broadly reusable across multiple services or domains
- the helper has no strong business or provider ownership
- moving it to utils makes another copied module easier to understand

### Keep code in a service directory when:

- it encodes provider contracts or domain semantics
- it exists mainly to support one service family
- promoting it to utils would create a fake sense of generality

### Keep a helper local to one feature when:

- it is only meaningful inside that feature
- exporting it more broadly would increase noise without real reuse

## Anti-Patterns

### Barrel files

Do not add `index.ts` barrels to smooth over import paths. In Edge Kit they:

- hide actual module ownership
- grow unused module graphs
- make copy-paste boundaries less obvious
- encourage package-style design instead of toolkit-style design

Import the concrete file directly unless the repo already has an intentional
entrypoint that is part of the documented surface.

### Convenience-first abstraction

Do not add a “generic” layer just because two files share logic. Shared logic
is not automatically shared architecture.

### Local reinvention

Before adding a new error, helper, or abstraction, check for:

- `src/utils/custom-error.ts`
- existing HTTP/crypto/string/object/date helpers in `src/utils/`
- abstract service contracts in nearby service directories
- logging and mutex/key-value primitives already in the repo

## Error Handling Doctrine

Use typed `CustomError` patterns when the error is part of the service contract
or should be meaningfully inspected by callers. Use plain `Error` only when the
failure is purely local and not worth standardizing.

## Docs Doctrine

When a change affects discoverability or the intended usage surface:

- update `README.md`
- update or add the feature’s `FEATURE.md`
- update service docs under `docs/services/` when present

When a change introduces or changes architecture:

- follow DocDD
- ensure ADR and FEATURE docs describe what actually shipped

## Copy-Paste Litmus Test

Before finishing, ask:

1. If someone copied only this module and its obvious dependencies, would the
   structure still make sense?
2. Does the import graph reveal ownership clearly?
3. Did I introduce anything mainly to make this repo feel like an installed
   package?
4. Would a new developer understand where the next related file should go?

If the answer to 3 is yes, revisit the design.
