# [0002] Add Contextualizer, Richer Storage, and AI Runtime Support

**Status:** `Implemented`

**Date:** 2026-03-14

---

## TL;DR

Edge Kit now adds a first-class `contextualizer` service family, expands the
existing storage abstraction in place, introduces generic AI diagnostics under
`llm`, adds generic probe execution under `health`, and hardens
`EncryptionService` with typed failure modes. These changes are coordinated but
remain split by concern so the modules stay copy-paste friendly.

---

## Decision

`src/services/contextualizer/` is introduced as a dedicated service family for
typed provider orchestration, provider-scoped caching, and provider-owned
rendering. It is intentionally not a composer or a generic utility because it
owns runtime fetch and cache behavior rather than prompt template substitution
or low-level helpers.

The existing storage abstraction is evolved in place rather than replaced with
a parallel `ObjectStorage` API. New capabilities such as `exists`,
`deleteMany`, `listPage`, richer write bodies, and improved write presigns are
added to `AbstractStorage` and the existing provider implementations.

Generic AI diagnostics are placed under `src/services/llm/` because they are
about AI SDK failure handling rather than generic service health. Generic probe
execution, including an AI provider probe helper, is placed under the new
`src/services/health/` family because its responsibility is runtime health
reporting and probe orchestration.

No DB-backed upload-presign persistence or workflow-observability helper layer
is added in this phase. This change is intentionally scoped to reusable service
primitives.

### Alternatives Considered

- **Place Contextualizer under composers:** Rejected because it owns runtime
  fetching and cache behavior, not prompt composition.
- **Introduce a parallel storage abstraction:** Rejected because it would split
  the public API and duplicate provider implementations.
- **Put AI diagnostics under health:** Rejected because diagnostics are
  primarily an AI SDK error-normalization concern, not a health orchestration
  concern.
- **Bundle PII redaction into the same initiative:** Rejected to keep scope
  limited to the agreed ADR-0002 services.

---

## Constraints

- Contextualizer must stay generic, dependency-light, and copy-paste ready.
- Contextualizer providers own rendering, but Contextualizer itself must not
  own domain-specific prompt assembly rules.
- Storage must keep `write/read` naming in this phase; do not rename the public
  API to `upload/download`.
- Storage presign helpers must support the new `maxBytes`/`minBytes` options
  while accepting the old `bytesLimit` compatibility alias.
- AI diagnostics must support `ai` SDK parse and validation failures without
  coupling to one workflow or domain.
- Health probes must remain generic and framework-agnostic.
- Encryption hardening must preserve the existing encrypted payload format.

---

## Consequences

Positive: Edge Kit gains a coherent set of runtime primitives for context
assembly, richer object storage, reusable AI failure normalization, generic
health checks, and safer secret handling.

Negative: The public storage API surface grows, and new feature-context files
must be maintained across more service areas.

Observed tradeoff: Contextualizer includes rendering to keep provider behavior
cohesive, but prompt assembly still stays outside it to avoid creating an
overgrown workflow object.

Tech debt deferred or created: upload-presign persistence, provider-specific
health dashboards, and workflow trace/SSE helpers remain out of scope and may
require future ADRs if added later.

---

## Assumptions and Defaults

- Contextualizer fetch caching defaults to a short-lived KV-backed cache when a
  KV implementation is provided; otherwise it behaves as an in-memory-free
  orchestration layer.
- AI provider probes are text-generation only in v1.
- Storage metadata is written through provider-native object metadata support
  where available.
- No database or audit layer is required to use the richer write presign API.

---

## User Flow / Public API / Contract Changes

### Contextualizer

New public surface:

```ts
interface ContextProvider<TParams, TItem> {
  readonly id: string;
  fetch(params: TParams): Promise<{ items: TItem[]; nextCursor?: string }>;
  render(item: TItem): string;
  renderPage?(result: { items: TItem[]; nextCursor?: string }): string;
  getCacheKey?(params: TParams): string;
}

class Contextualizer<TProviders> {
  provider(key)
  listProviders()
  fetch(request, options?)
  fetchProvider(key, params, options?)
  renderProvider(key, result)
  fetchAndRender(request, options?)
}
```

### Storage

`AbstractStorage` now additionally supports:

- `exists(key)`
- `deleteMany(keys)`
- `listPage(prefix, options?)`

`write()` accepts a richer cross-runtime body type, and
`createWritePresignedUrl()` accepts `maxBytes`, `minBytes`, and legacy
`bytesLimit`.

### AI diagnostics

New public surface under `src/services/llm/`:

- `AiDiagnosticIssue`
- `AiDiagnostics`
- `AiDiagnosticError`
- `buildAiDiagnosticsFromError(...)`
- `getAiDiagnostics(...)`
- `isAiDiagnosticError(...)`

### Health

New public surface under `src/services/health/`:

- `HealthProbeResult`
- `runHealthProbe(...)`
- `runHealthProbeSuite(...)`
- `createAiProviderProbe(...)`

### Secrets

`EncryptionService` now throws:

- `InvalidEncryptedDataError`
- `DecryptionFailedError`

while preserving the existing encrypted string format.

---

## Related ADRs

- ADR-0001 — Use TOON as the default structured-data encoder in PromptComposer
