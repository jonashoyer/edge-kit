# Feature: KV-backed Mutex

Date: 2025-09-27

## 1. Codebase-First Analysis

### Existing Code Search

- `src/services/key-value/abstract-key-value.ts`: KV interface, `get|set|delete|exists|expire|increment|decrement|z*`, `withCache`
- `src/services/key-value/upstash-redis-key-value.ts`: Redis impl
- `src/services/key-value/ioredis-key-value.ts`: Redis impl
- `src/services/key-value/drizzle-key-value.ts`: SQL-backed KV impl
- `src/services/stripe/kv-store.ts`: KV usage patterns, namespacing
- `src/services/secret/kv-secret-storage-service.ts`: KV + namespacing, prefixed keys
- `src/services/logging/abstract-logger.ts`: logging interface
- `src/services/logging/*`: concrete loggers
- `src/utils/try-catch-utils.ts` and `src/utils/promise-utils.ts`: result wrappers
- `src/utils/fetch-utils.ts`: retries/backoff pattern
- `src/utils/misc-utils.ts`: `timeout`
- `src/utils/id-generator.ts`: `genId`
- `src/services/mutex/mutex-kv.ts`: target (empty)

### Reusable Scaffolding

- KV contract: `AbstractKeyValueService`
- Namespacing pattern: prefix helpers (secret/stripe)
- Retry/backoff: `fetchExt` pattern (adapt)
- Sleep util: `timeout`
- Token gen: `genId`
- Logging: `AbstractLogger`

### External Research (If Necessary)

- Only if strict atomic `SET NX PX` required
- Reference: Redlock algorithm (docs only)

## 2. Specifications

### User Stories

- Acquire lock by key
- Release lock by owner token
- Auto-expire (TTL)
- TryLock with retries/backoff
- Extend/refresh lock
- Observe metrics/logs

### Technical Approach

- Key: `mutex:{name}`
- Value: `{ token, owner?, expiresAt? }` (JSON) or token string
- TTL: set via `expire(ttlSeconds)`
- Acquisition: check `exists` -> set if absent -> `expire`
- Conflict: retry with backoff, jitter
- Ownership: compare token on release
- Refresh: `expire` if token matches

## 3. Development Steps

1. Define `MutexKV` interface, options (ttl, retries, backoff, jitter)
2. Implement `acquire(name) -> token` using KV + retry/backoff
3. Implement `release(name, token)` with token check + delete
4. Implement `withLock(name, fn)` helper
5. Implement `refresh(name, token)`
6. Add namespacing/prefix helper for keys
7. Instrument logging (acquire/retry/timeout/release/fail)
8. Usage examples with existing KV impls
