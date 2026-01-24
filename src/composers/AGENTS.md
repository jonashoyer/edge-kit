# src/composers/

Composable helpers for building prompts, templates, and namespaces.

## Where to look

- `namespace-composer.ts`: type-safe key namespace composition (used by multiple services)
- `prompt-composer.ts`: structured prompt construction
- `template-composer.ts`: template substitution helpers

## Conventions

- Keep APIs small and copy-paste ready.
- Prefer `as const` exports for grouped helper objects.
