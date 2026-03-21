# Feature: Task Reconciler

Status: Active
Last Reviewed: 2026-03-20

## Current State

`src/services/task-reconciler/` provides a central registry-based
desired-vs-applied revision reconciliation primitive for operational tasks
such as reindexing, backfills, cache rebuilds, and search syncs.

It owns per-task reconciliation state, lock-scoped execution, and structured
result reporting. Callers register task definitions up front, and each
definition provides a task name, a desired-revision resolver, and the work
callback to run when reconciliation is needed.

It is also a downstream integration point for verified inbound events handled
by `src/services/incoming-hook/` and internal signed trigger requests handled
by `src/services/service-ingress/`. Those integrations stay thin: caller code
verifies and filters the external event or ingress payload first, then maps it
to the reconciler API.

The current implementation keeps the direct single-task `shouldReconcile()` /
`reconcile()` path for compatibility, but the registry-based sweep APIs are the
primary model.

## Implementation Constraints

- Keep the service generic, copy-paste friendly, and dependency-light.
- Treat `desiredRevision` as an opaque caller-provided string.
- Register task definitions at construction time for the central sweep path.
- Persist reconciliation state through `AbstractKeyValueService`.
- Coordinate execution through `AbstractMutex`.
- Advance `appliedRevision` only after the callback completes successfully.
- Keep logging optional and structured through `AbstractLogger`.
- Sweep registered tasks sequentially and continue after individual failures.
- Support inline reconciliation only in this phase. Async queues or schedulers
  must live outside this feature.
- Keep inbound webhook verification, HMAC authentication, signed ingress
  verification, and framework adapters outside this feature. Those concerns
  belong to `src/services/incoming-hook/` and `src/services/service-ingress/`.

## Public API / Contracts

- `TaskReconcilerState`
- `ShouldReconcileOptions`
- `ShouldReconcileResult`
- `ShouldReconcileReason`
- `TaskReconcilerTaskDefinition`
- `TaskReconcilerExecutionContext`
- `ReconcileOptions`
- `ReconcileResult`
- `CheckTaskOptions`
- `CheckTaskResult`
- `CheckAllOptions`
- `CheckAllResult`
- `CheckAllTaskResult`
- `ReconcileTaskOptions`
- `RegisteredTaskReconcileResult`
- `ReconcileAllOptions`
- `ReconcileAllResult`
- `ReconcileAllTaskResult`
- `AbstractTaskReconciler`
- `TaskReconciler`
- `defineTaskReconcilerServiceIngress(...)`
- `TaskReconcilerServiceIngressMode`
- `TaskReconcilerServiceIngressParams`
- `TaskReconcilerServiceIngressResult`

The service-ingress trigger helper is intentionally small and lives beside the
feature so internal trigger transport does not leak into the core reconcile
contracts.

## What NOT To Do

- Do not turn this into a generic trigger or event-bus helper.
- Do not add queue adapters, DAG orchestration, or background scheduling here.
- Do not add revision ordering, semantic-version parsing, or time-based
  comparison rules.
- Do not encode indexing, migration, or deployment-specific logic in this
  package.
- Do not absorb webhook verification, signed request parsing, or Next.js route
  wrapper logic into this package.
