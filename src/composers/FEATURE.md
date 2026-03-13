# Feature: Composers

Status: Active
Last Reviewed: 2026-03-06

## Current State

`src/composers/` provides copy-paste composition helpers for namespaces,
prompt construction, and template handling.

`PromptComposer` now exposes an explicit `format()` API for structured prompt
data. The default mode is TOON via `@toon-format/toon`, with opt-in `xml`,
`list`, and `keyValue` modes. `build()` and `composer()` remain the template
substitution entrypoints, and the legacy `arrayToList()`,
`objectToKeyValue()`, and `jsonToXml()` helpers remain available for
compatibility.

## Implementation Constraints

- Keep composer APIs small, copy-paste ready, and dependency-light beyond the
  dependency already required by the module.
- Route new structured prompt-data rendering through
  `PromptComposer.format()` instead of adding one-off serializer helpers.
- Keep `PromptComposer.build()` and `PromptComposer.composer()` explicit. Do
  not add automatic array or object detection inside `composer()`.
- Preserve XML support as an explicit mode; TOON does not replace XML-specific
  prompt contracts.
- Do not couple `src/utils/markdown-utils.ts` to TOON without a separate
  decision, because that utility owns schema-driven presentation rather than
  prompt-layer raw data encoding.

## Public API / Contracts

- `PromptComposer.build(template, params): string`
- `PromptComposer.composer(template, components, params): string`
- `PromptComposer.format(data, options?): string`
- `PromptComposer.arrayToList(arr): string`
- `PromptComposer.objectToKeyValue(obj): string`
- `PromptComposer.jsonToXml(json, rootName?): string`

`PromptComposer.format()` supports:

- `format?: 'toon' | 'xml' | 'list' | 'keyValue'`
- `rootName?: string`
- `toon?: EncodeOptions`

`list` mode rejects non-array input and `keyValue` mode rejects non-object
input with explicit runtime errors.

## Known Tech Debt

- XML serialization logic still exists in both `PromptComposer` and
  `markdown-utils`; this change intentionally did not unify them.
- `markdown-utils` has no TOON output mode yet, so structured prompt-data
  formatting remains split between prompt-layer and schema-layer utilities.

## What NOT To Do

- Do not treat TOON as a replacement for all structured output in the repo.
- Do not remove the legacy prompt helpers until callers have migrated.
- Do not broaden this feature by changing `markdown-utils` behavior as part of
  prompt-layer formatter work.
