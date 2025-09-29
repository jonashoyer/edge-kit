# Feature: Feature Flag Status Calculator

Date: 2025-09-29

## 1. Codebase-First Analysis

### Existing Code Search

- `src/services/feature-flag/feature-flag.ts`: flag types; phased rollout math; RNG seeding; logger warnings
- `src/utils/number-utils.ts`: `clamp`, `round`
- `src/utils/random-utils.ts`: seeded RNG (not needed for status, only evaluation)
- `src/utils/date-utils.ts`: partial; not reliable; avoid
- `src/utils/type-utils.ts`: helper types (possibly for utility return types)

### Reusable Scaffolding

- `FeatureFlagService#getAllFlags()`: enumerate flags for status UI
- Phased rollout formula: step, percentage calc
- `AbstractLogger`: log anomalies (invalid config)

### External Research (If Necessary)

- None required; plain math/time

## 2. Specifications

### User Stories

- Dev: list all flags with current status
- Dev: see phased rollout progress/ETA to max
- Dev: know which flags are fully active vs partial
- Dev: show next step time and steps remaining

### Technical Approach

- Input: `FeatureFlagService<T>` instance; `now = Date.now()` (optional override)
- Output per-flag: `{ name, kind, disabled, effective, details }`
  - `kind`: `enabled` | `percentage` | `phased`
  - `effective`: boolean (if we consider global activation vs per-identifier)
  - `details` by kind:
    - enabled: `{ value }`
    - percentage: `{ rolloutPercentage }`
    - phased: `{ currentPercentage, step, nextStepAt, stepsToMax, etaToMax, maxRolloutPercentage }`
- Compute phased: `step = floor((now - origin)/interval)`; `pct = clamp(initial + increment*step, 0, max||1)`; `nextStepAt = origin + (step+1)*interval`; `stepsToMax = ceil((max - current)/increment)`; `etaToMax = origin + ceil((max - initial)/increment)*interval`
- Do not call `isEnabled` (identifier-dependent); focus on global progression
- Validate inputs; guard negatives/NaN; logger warns

## 3. Development Steps

1. Create `src/services/feature-flag/feature-flag-status.ts`
2. Export `computeFeatureFlagStatuses<T>(service: FeatureFlagService<T>, opts?: { now?: number; logger?: AbstractLogger })`
3. Implement per-flag switch by discriminant:
   - `enabled in flag`
   - `rolloutPercentage in flag`
   - `rolloutInterval in flag`
4. Implement phased math with `clamp` from number-utils
5. Add helper `computePhasedRolloutStats(flag, now)` returning details
6. Type-safe return: `Array<{ name: T; kind: enabled|percentage|phased; disabled?: boolean; effective: boolean; details: ... }>`
7. Handle `disabled`: always `effective = false`; include computed details for reference
8. Document examples in JSDoc; note identifier-independent semantics
9. Unit tests: phased math; nextStepAt; etaToMax; clamp bounds; disabled precedence
