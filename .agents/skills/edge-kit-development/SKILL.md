---
name: Edge Kit Development
description: Edge Kit repository development workflow and architecture guardrails for both human developers and code agents. Use when implementing, refactoring, reviewing, or documenting code inside Edge Kit, especially when deciding where code belongs, how public APIs should be exposed, whether logic belongs in services vs utils, how to keep modules copy-paste-first, and what docs/tests must ship with a change.
---

# Edge Kit Development

## Overview

Develop Edge Kit as a copy-paste-first toolkit, not as a package-first SDK.
Optimize for explicit module boundaries, minimal dependency surfaces, and code
that is easy to lift into another codebase without dragging half the repo with
it.

## Workflow

Follow this sequence before and during implementation:

1. Read the repo rules first:
   `AGENTS.md`, plus any local guidance in `src/utils/AGENTS.md`,
   `src/services/AGENTS.md`, and relevant `FEATURE.md` files.
2. Decide placement before coding:
   **Cross-cutting and broadly reusable?** Put it in `src/utils/`.
   **Domain-specific orchestration or provider logic?** Keep it in a service
   directory.
   **Only useful inside one feature and not broadly reusable?** Keep it local
   to that feature.
3. Reuse existing primitives before inventing new ones:
   prefer `CustomError`, existing logging abstractions, abstract contracts,
   DI patterns, and established naming.
4. Implement with explicit imports and explicit file boundaries.
5. Finish the whole change:
   tests, docs, README discoverability, and DocDD artifacts when the change is
   architectural or cross-cutting.

## Non-Negotiables

- Do not add barrel files to make imports nicer. Edge Kit prefers direct
  imports and small module graphs.
- Do not optimize for package ergonomics over liftability.
- Do not hide placement mistakes behind an `index.ts`.
- Do not create feature-local utility files for helpers that belong in
  `src/utils/`.
- Do not move product or provider business logic into a generic utility or
  toolkit layer.
- Do not add dependencies casually. Keep modules easy to copy.

## Placement Rules

Use this decision rule:

- `src/utils/`
  Only for helpers with value across multiple services or domains.
- `src/services/<domain>/`
  For domain contracts, provider implementations, orchestration, and examples
  tied to that service family.
- Local feature utility file inside a service
  Only when the helper is specific to that feature and would be misleading or
  noisy in `src/utils/`.

If a helper feels “generic” only because the current feature uses it in several
files, that is not enough. It must plausibly help other parts of Edge Kit.

## Design Doctrine

- Think in files that can be copied, not APIs that look elegant in aggregate.
- Prefer abstract contracts plus concrete implementations for services.
- Prefer constructor injection over hidden globals.
- Prefer typed custom errors over ad hoc `Error` subclasses when the error is a
  meaningful service contract.
- Prefer examples and docs that teach copy-paste usage, not package-install
  usage.
- Treat tests and docs as part of the module boundary, not optional polish.

## Review Lens

When reviewing work in Edge Kit, check these first:

- Did the change choose the right directory before adding code?
- Did it avoid barrel files and indirect exports?
- Did it reuse existing repo primitives?
- Did it keep generic layers generic and business layers specific?
- Did it add only the minimum helpers required?
- Did it update tests and discoverability docs?
- Does the result still make sense if copied into another repo?

## References

- For the full doctrine and anti-patterns, read
  `references/edge-kit-doctrine.md`.
- If the change is architectural or cross-cutting, also use the repo’s
  `doc-dd` skill and follow its ADR/FEATURE workflow.
