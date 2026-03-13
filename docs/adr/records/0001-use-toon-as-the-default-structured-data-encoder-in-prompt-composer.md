# [0001] Use TOON as the default structured-data encoder in PromptComposer

**Status:** `Implemented`

**Date:** 2026-03-06

---

## TL;DR

`src/composers/prompt-composer.ts` now uses `@toon-format/toon@^2.1.0` as the
default encoder for structured prompt data exposed through
`PromptComposer.format()`. This was added because the existing
array/object helpers are too limited for LLM-oriented payloads, and future
prompt-layer work must use the explicit formatter API rather than add more
ad-hoc serializers.

---

## Decision

`src/composers/prompt-composer.ts` exposes a new `PromptComposer.format()`
API that formats structured data using one of four explicit modes: `toon`,
`xml`, `list`, or `keyValue`. The default mode will be `toon`, implemented
with `@toon-format/toon@^2.1.0`, and the existing `build()` and `composer()`
template APIs will remain unchanged.

The existing `arrayToList()`, `objectToKeyValue()`, and `jsonToXml()` helpers
will stay available for compatibility, but `arrayToList()` and
`objectToKeyValue()` will be treated as legacy convenience helpers rather than
the primary structured-data API. Documentation and examples will direct new
prompt-layer code to `PromptComposer.format()` when the goal is to render
arrays, objects, or JSON-like data for LLM input.

`src/utils/markdown-utils.ts` is explicitly out of scope for this decision.
Schema-driven markdown and XML rendering will continue unchanged until a
separate ADR decides whether a TOON output mode belongs there.

### Alternatives Considered

- **Keep only the existing helpers:** Rejected because bulleted lists and
  flat `key: value` output are too limited for nested or tabular LLM payloads.
- **Replace the entire prompt stack with TOON:** Rejected because template
  substitution and XML contracts still serve different needs and should remain
  explicit.
- **Add TOON to `markdown-utils` in the same change:** Rejected because that
  broadens scope into schema-rendering behavior and creates avoidable coupling.

---

## Constraints

- All new structured prompt-data rendering in
  `src/composers/prompt-composer.ts` must go through the explicit
  `PromptComposer.format()` API rather than new one-off serializer helpers.
- `PromptComposer.build()` and `PromptComposer.composer()` must retain their
  current template-substitution behavior; no automatic object or array
  detection may be added to `composer()`.
- `PromptComposer.format()` must support exactly four modes in this phase:
  `toon`, `xml`, `list`, and `keyValue`.
- `toon` mode must pass through TOON encoder options rather than wrapping them
  in a second incompatible option model.
- `list` mode must reject non-array input and `keyValue` mode must reject
  non-object input with explicit runtime errors rather than silently
  coercing incompatible values.
- `arrayToList()`, `objectToKeyValue()`, and `jsonToXml()` must remain
  available for compatibility during this phase.
- `src/utils/markdown-utils.ts` must not be modified to depend on TOON without
  a separate ADR.
- README and prompt-composer examples must recommend TOON for LLM-oriented
  structured data and clearly preserve XML and markdown-schema use cases.

---

## Consequences

Positive: The prompt layer gains a single structured-data entrypoint that is
better aligned with LLM inputs and more capable than the current ad-hoc
helpers. Prompt examples become easier to standardize because TOON handles
flat objects, primitive arrays, and uniform object arrays with one API.

Negative: The composer API surface becomes slightly larger, and the repo must
document when TOON should be used versus XML or schema-driven markdown.
Callers that prefer the old helpers will see them remain available, which
means some duplicate functionality will temporarily coexist.

Observed tradeoff: the generic `format()` API now has mode-specific validation.
This avoids silently producing misleading output for incompatible `list` and
`keyValue` inputs, but it means callers migrating from direct helper usage
must choose the mode intentionally.

Tech debt deferred or created: This decision does not unify the duplicated XML
serialization logic across prompt and markdown utilities, and it intentionally
defers any `markdown-utils` TOON integration to a future ADR.

---

## Assumptions and Defaults

- Assumes `@toon-format/toon@^2.1.0` remains installed and usable in the
  current TypeScript/ESM toolchain.
- Assumes most prompt-layer structured payloads are consumed by LLMs rather
  than external XML-only parsers.
- Default formatter mode is `toon`; XML remains opt-in through
  `PromptComposer.format(data, { format: 'xml' })` or `jsonToXml()`.
- Assumes this change should not alter `markdown-utils` output contracts.

---

## User Flow / Public API / Contract Changes

Before:

- `PromptComposer` exposes `build()`, `composer()`, `arrayToList()`,
  `objectToKeyValue()`, and `jsonToXml()`
- Structured prompt data requires callers to pick a narrow helper manually

After:

- `PromptComposer` additionally exposes:

```ts
type PromptFormat = 'toon' | 'xml' | 'list' | 'keyValue';

type PromptFormatOptions = {
  format?: PromptFormat;
  rootName?: string;
  toon?: EncodeOptions;
};

PromptComposer.format(data: unknown, options?: PromptFormatOptions): string;
```

- New prompt-layer examples should prefer `PromptComposer.format()` for
  arrays, objects, and JSON-like data intended for LLM input
- Existing helper functions remain supported in this phase

---

## Related ADRs

None.
