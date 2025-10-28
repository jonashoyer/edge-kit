# Feature: Error Escalation Service

## 1. Codebase-First Analysis

### Existing Code Search

- `src/services/notification/abstract-notification.ts`: DI notification target
- `src/services/notification/slack-notification.ts`: Slack provider (text/blocks)
- `src/services/alerting/*`: alert patterns, Slack block composition
- `src/services/key-value/abstract-key-value.ts`: KV ops (get/set/incr/expire, zset)
- `src/services/key-value/*`: Upstash/Drizzle/ioredis implementations
- `src/services/mutex/mutex-kv.ts`: TTL counter + expire usage pattern
- `src/services/logging/*`: `AbstractLogger`, console/axiom loggers
- `src/utils/date-utils.ts`: light date helpers

### Reusable Scaffolding

- Abstract service class + constructor DI
- KV `increment` + `expire` rolling-window pattern
- Logger metadata conventions
- Slack text/blocks payload shape
- Key namespacing approach (mutex-style)

### External Research (If Necessary)

- Not needed; TTL counters cover windows
- Optional future: zset-based sliding windows (if needed)

## 2. Specifications

### User Stories

- Dev: capture error, configure rules inline
- Dev: notify on N errors within T window
- Dev: optional groupId (e.g. userId) per error
- Dev: inline rule config per capture call
- Dev: dedupe notifications per window
- Dev: query quick metrics via KV

### Technical Approach

- Deps: `AbstractNotificationService`, `AbstractKeyValueService`, optional `AbstractLogger`
- API: `capture(error, config)` where config: `{ name, groupId?, rules, tags? }`
- Rule types (discriminated union):
  - `{ type: 'always'; message?; channel? }` - notify every occurrence
  - `{ type: 'threshold'; count; windowSeconds; message?; channel? }` - notify after N in T
  - `{ type: 'cooldown'; intervalSeconds; message?; channel? }` - notify max once per T
- Keys (namespace `err:`):
  - counts: `err:{name}:{groupId}:count:{window}` (TTL = window, for threshold)
  - cooldown: `err:{name}:{groupId}:cooldown:{ruleIndex}` (TTL = interval, for cooldown)
- Flow:
  - extract error metadata (message, stack, type)
  - for each rule:
    - **always**: notify immediately
    - **threshold**: increment window key + expire; notify if count >= threshold
    - **cooldown**: check cooldown key; notify if absent, then set with TTL
  - include context (groupId, counts, error metadata, stack) in payload
- Notification: text default; optional Slack blocks
- Stack trace: include when available, no PII redaction (user responsibility)
- No defaults: all rules explicitly configured per capture call

## 3. Development Steps

1. Define types: discriminated union `EscalationRule` (always/threshold/cooldown)
2. Define `CaptureConfig`, `ErrorMetadata` types
3. Implement `ErrorEscalationService` (KV + Notification + Logger)
4. Key namespace helpers (prefix, groupId optional, rule-specific keys)
5. Error metadata extractor (message, stack, type)
6. Rule evaluator per type (always/threshold/cooldown logic)
7. Message formatter (text + optional Slack blocks, include stack)
8. Docs: service README + usage snippet
9. Optional helpers: `getCounts`, `reset`

---

Ready to implement with:

- Inline config per `capture()` call
- `groupId` optional
- Stack trace included (no PII logic)
- Rules-based config only (no defaults)
