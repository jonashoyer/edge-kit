# src/services/

Service implementations organized by domain.

## Structure

- Each domain is `services/<domain>/` (e.g. `stripe/`, `storage/`, `key-value/`).
- Some services include local docs/examples (notably `stripe/`).

## Where to look

| Task                     | Location                     |
| ------------------------ | ---------------------------- |
| Billing                  | `stripe/`                    |
| Storage                  | `storage/`                   |
| Key-Value                | `key-value/`                 |
| Vector DB                | `vector/`                    |
| RAG / reranking          | `rag/`                       |
| Integrity / signing      | `integrity/`                 |
| Secrets                  | `secret/`                    |
| Logging / alerting       | `logging/`, `alerting/`      |
| Feature flags / waitlist | `feature-flag/`, `waitlist/` |

## Conventions (repo-specific)

- Prefer an abstract contract (`abstract-*.ts`) before provider implementations.
- Dependency injection: pass clients/loggers/kv via constructor.
- Use typed `CustomError` patterns where applicable.

## Anti-patterns

- Hardcoding secrets (see `secret/README.md`).
- Logging sensitive info / PII (see `docs/services/logging.md`, `docs/services/analytics.md`).
