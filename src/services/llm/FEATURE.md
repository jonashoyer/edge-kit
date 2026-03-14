# Feature: LLM Services

Status: Active
Last Reviewed: 2026-03-14

## Current State

`src/services/llm/` provides AI-runtime support services. It now includes cache
middleware, optimistic warm-up support, and generic AI diagnostics utilities
for normalizing AI SDK failure shapes.

## Implementation Constraints

- Keep diagnostics generic and workflow-agnostic.
- Normalize AI SDK parse and validation errors without coupling to one domain.
- Keep diagnostics safe for logs and UI by truncating raw previews.

## Public API / Contracts

- `AiDiagnosticIssue`
- `AiDiagnostics`
- `AiDiagnosticError`
- `buildAiDiagnosticsFromError(...)`
- `getAiDiagnostics(...)`
- `isAiDiagnosticError(...)`

## What NOT To Do

- Do not bake one workflow’s stage names or domain semantics into diagnostics.
- Do not move generic health orchestration into this feature.
