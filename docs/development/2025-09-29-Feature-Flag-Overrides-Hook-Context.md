# Feature: Feature Flag Overrides Hook + Context

Date: 2025-09-29

## 1. Codebase-First Analysis

### Existing Code Search

- `src/services/feature-flag/feature-flag.ts`: flag types; `isEnabled`; percentage/phased; seeded RNG
- `src/utils/random-utils.ts`: `seedRandomNumberGenerator`
- `src/services/logging/abstract-logger.ts`: pluggable logger interface
- `src/composers/namespace-composer.ts`: namespaced keys builder
- `src/services/key-value/*`: `AbstractKeyValueService`; Upstash/IoRedis/Drizzle impls
- `src/services/analytics/use-posthog-analytics.tsx`: minimal hook pattern

### Reusable Scaffolding

- `FeatureFlagService<T>`: evaluation core; identifier-based RNG
- `AbstractLogger`: warn on missing id; conflicts
- `NamespaceComposer`: override key prefixing
- Hook shape reference: `useAnalytics`

### External Research (If Necessary)

- Browser `localStorage` (client only)
- No external libs

## 2. Specifications

### User Stories

- Dev: view/inspect all flags
- Dev: toggle/force specific flags
- Dev: per-identifier overrides
- Dev: persist overrides; quick reset

### Technical Approach

- Context API: `{ service, overrides, setOverride, clearOverride, resolve(name,id) }`
- Hooks: `useFeatureFlags<T>()`; `useFeature<T>(name,id?)`
- Merge precedence: `disabled → false` ; `override → highest` ; `enabled` literal ; `percentage/phased` via service
- Override schema:
  - `enabled: boolean` (force on)
- Persistence backend: local only (browser `localStorage`)
- SSR/Edge handling:
  - no `localStorage`; read-only server render
  - client hydrates; merges local overrides; re-resolve
- Types: generic `<T extends string>` for flag names; strict unions for overrides

## 3. Development Steps

1. Namespace keys: `ff:{serviceName}:{flagName}`; per-identifier `ff:{serviceName}:{flagName}:{id}`
2. Provider: `FeatureFlagOverridesProvider<T>` props `{ service, logger?, persist?: 'local'|'none', prefix?, enable? }`
3. Storage adapter: `local` only
4. Override model: `{ enabled?: boolean }`
5. Resolver: override `enabled===true` → enabled; else service evaluation; include `{ source, overridden, reason }`
6. Hooks: `useFeatureFlags<T>()`, `useFeature<T>(name,id?)`
7. SSR/Edge: noop local adapter; hydrate merge on client
8. Dev hook: list, toggle, reset
9. Docs/examples: Next.js client/SSR; identifier-based usage
10. Tests: resolver precedence; schema parse; storage strategy; SSR/hydration merge
