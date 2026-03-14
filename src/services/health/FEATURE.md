# Feature: Health

Status: Active
Last Reviewed: 2026-03-14

## Current State

`src/services/health/` provides small, reusable probe primitives for runtime
health checks. It supports single probes, suites of probes, and AI-provider
text-generation probes.

## Implementation Constraints

- Keep probes framework-agnostic and dependency-light.
- Health helpers may orchestrate probe execution and timing, but they should
  not encode product-specific monitoring policy.
- AI provider probes are text-generation only in this phase.

## Public API / Contracts

- `HealthProbeResult`
- `HealthProbeDefinition`
- `HealthProbeSuiteResult`
- `runHealthProbe(...)`
- `runHealthProbeSuite(...)`
- `createAiProviderProbe(...)`

## What NOT To Do

- Do not add provider-specific dashboards or transport adapters here.
- Do not couple this feature to one storage, queue, or web framework.
- Do not broaden v1 into embedding, image, or workflow-trace probes.
