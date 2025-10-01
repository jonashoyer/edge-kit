# Feature: Markdown Schema Builder

Date: 2025-10-01

## 1. Codebase-First Analysis

### Existing Code Search

- `src/composers/prompt-composer.ts`: `jsonToXml`, `arrayToList`, `objectToKeyValue`
- `src/utils/tpl/tpl.ts`: `tpl` tagged template, dedent, hashing
- `src/services/notion/notion-client.ts`: Markdown rendering patterns (headings, lists)
- `src/utils/object-utils.ts`: object helpers (merge/iterate) [verify]
- `src/utils/string-utils.ts`: `ml`, string helpers
- `docs/composers.md`: usage examples for `PromptComposer`

### Reusable Scaffolding

- `PromptComposer.jsonToXml` for XML conversion
- `tpl` for inline usage in prompts/templates
- Notion markdown converters as rendering reference (headings/bullets)
- Array/object utils for traversal and formatting

### External Research (If Necessary)

- None required; internal utilities sufficient

## 2. Specifications

### User Stories

- Dev: define schema with field configs
- Dev: recursive nested object rendering
- Dev: per-field `outputFormat`
- Dev: inline/bulleted arrays with threshold
- Dev: custom `transform` per field
- Dev: XML root element naming
- Dev: integrate with `tpl`

### Technical Approach

- Types: `FieldFormat`, `OutputFormat`, `FieldConfig<T>`, `MdSchemaConfig<T>`, `MdSchema<T>`
- Factory: `mdSchema<T>(config)`
- Builder: `mdBuild<T>(data, schema)`
- Recursion: depth-first; respect `schema.fields` and fallbacks
- Mixed formats: check field `outputFormat` else inherit schema `format`
- XML path: pre-transform per-field then call `PromptComposer.jsonToXml`
- Arrays: `inline`, `inlineThreshold`, bullets fallback
- Labels: `formatLabel` for bold/italic/code/plain
- Nested: `renderNested` with indentation and bullet prefixes
- Omit rules: `omitIfEmpty`
- Safety: exhaustive type checks; no `any`; pure functions

## 3. Development Steps

1. Define TypeScript types (schema, field, formats)
2. Implement `mdSchema()`
3. Implement helpers: `formatLabel`, `renderArray`, `renderNested`
4. Implement recursive `mdBuild()` (markdown path)
5. Implement XML mode (`mdBuildXml()` using `jsonToXml`)
6. Add per-field `outputFormat` override logic
7. Add auto-inline threshold logic for arrays
8. Add examples and docs in `docs/utils.md`
9. Write tests: markdown, XML, mixed, nested, arrays, transforms
10. Integrate with `tpl` examples; verify hashing unaffected
