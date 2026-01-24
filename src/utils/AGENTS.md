# src/utils/

Cross-cutting utilities reused by services.

## Where to look

| Need                         | File                                       |
| ---------------------------- | ------------------------------------------ |
| Typed errors                 | `custom-error.ts`, `error-utils.ts`        |
| Resilient HTTP               | `fetch-utils.ts`                           |
| Types                        | `type-utils.ts`                            |
| Crypto / signatures          | `crypto-utils.ts`, `signature-utils.ts`    |
| IDs                          | `id-generator.ts`, `reference-id-utils.ts` |
| Markdown/XML schema building | `markdown-utils.ts`                        |

## Conventions

- Check for an existing utility here before adding a new one.
- Keep utilities dependency-light and copy-paste friendly.

## Complexity hotspots

- `fetch-utils.ts` is intentionally large (retries/backoff/error+schema handling). Prefer extending options rather than re-implementing fetch wrappers.
- `markdown-utils.ts` encodes schema-driven rendering rules; change carefully.
