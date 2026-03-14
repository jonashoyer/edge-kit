# Feature: Contextualizer

Status: Active
Last Reviewed: 2026-03-14

## Current State

`src/services/contextualizer/` provides typed provider orchestration for
fetching reusable context, caching provider results, and rendering those
results into provider-owned text output.

The service is intentionally generic. It coordinates providers and cache
behavior, but it does not own prompt-template composition or domain-specific
workflow assembly.

## Implementation Constraints

- Keep the surface small and copy-paste ready.
- Providers own fetch and render behavior.
- Contextualizer owns provider registration, typed orchestration, cache-key
  generation, and cache integration.
- Do not add prompt-template assembly rules or domain models to this package.
- Do not require a KV store; caching must degrade cleanly when none is
  configured.

## Public API / Contracts

- `ContextProvider<TParams, TItem>`
- `Contextualizer<TProviders>`
- `Contextualizer.fetch(request, options?)`
- `Contextualizer.fetchProvider(key, params, options?)`
- `Contextualizer.renderProvider(key, result)`
- `Contextualizer.fetchAndRender(request, options?)`

## What NOT To Do

- Do not move prompt composition into this feature.
- Do not add framework-specific hooks, React helpers, or transport-specific
  logic here.
- Do not bypass provider-owned cache keys with domain-specific special cases.
