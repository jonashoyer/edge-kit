# src/

Core TypeScript toolkit modules.

## Structure

- `services/`: copy-paste services (most code lives here)
- `utils/`: cross-cutting utilities used by services
- `composers/`: composition helpers (prompt/template/namespace)
- `db/`, `database/`: database helpers/types

## Where to look

| Task                           | Location                                                   |
| ------------------------------ | ---------------------------------------------------------- |
| Add a new service              | `services/<name>/` (prefer abstract base + provider impls) |
| Shared helper / type           | `utils/` (check here before creating new utility)          |
| Compose prompts/keys/templates | `composers/`                                               |
| SQLite/Drizzle helpers         | `db/`, `database/`                                         |

## Conventions (repo-specific)

- Copy-paste-first: keep modules self-contained and dependency-light.
- Services: prefer `Abstract*` contract + concrete implementation(s); inject dependencies via constructor.
- Named exports only (avoid default exports).
- File naming: kebab-case.

## Gotchas

- `tsconfig.json` includes `src/**/*` but excludes `**/*.test.ts` for type-checking.
