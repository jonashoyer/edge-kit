# [0012] Use a central registry-based TaskReconciler for versioned operational work
<!--
  REQUIRED | 🔴 HIGHEST WEIGHT
  Write as a declarative decision statement, not a topic label.
-->

**Status:** `Implemented`

**Date:** 2026-03-20

---

## TL;DR

Edge Kit treats `TaskReconciler` as a central registry-based reconciliation
service, not a per-call trigger helper. A single reconciler instance owns a
known collection of task definitions and can check or reconcile all registered
tasks in one sweep while preserving per-task desired-vs-applied revision state
in KV storage with mutex-backed coordination.

The public usage model is now “register tasks once, then trigger
`checkAll` / `reconcileAll` or the per-task convenience methods.” The service
remains generic, synchronous, and dependency-light; queueing, scheduling, and
workflow orchestration stay outside this module.

---

## Decision

Edge Kit implements `src/services/task-reconciler/` as a central registry-based
reconciliation service for versioned operational work such as reindexing,
backfills, cache rebuilds, and search syncs. The reconciler is constructed with
a registry of task definitions and exposes both collection-level and task-level
reconciliation methods:

- `checkAll(...)` and `reconcileAll(...)` for sweeping the registered task set
- `checkTask(taskName, ...)` and `reconcileTask(taskName, ...)` for direct
  access to one registered task
- compatibility support for the ad hoc single-task call pattern, with the
  registry-based model as the primary API

Each task definition provides:

- `taskName`
- `resolveDesiredRevision()` as a caller-owned opaque revision resolver
- `run(ctx)` as the reconciliation callback
- optional metadata for logging and persisted state

The reconciler uses existing runtime primitives through dependency injection:

- `AbstractKeyValueService` for durable per-task state
- `AbstractMutex` for concurrency control across callers and processes
- optional `AbstractLogger` for structured operational logging

The service compares each task’s resolved desired revision against its
persisted `appliedRevision`. If the task is stale, the reconciler acquires the
task lock, re-checks state inside the lock, marks the task `running`, invokes
the callback inline, and only then advances `appliedRevision` on success.
Failed executions preserve the prior applied revision.

The central sweep contract is synchronous and deterministic. `reconcileAll(...)`
walks the registered task set in registry order, executes only stale tasks, and
continues after individual failures so one bad task does not block the rest of
the sweep.

### Alternatives Considered

- **Keep `TaskReconciler` strictly per-task and caller-supplied:** Rejected
  because it forces every caller to re-implement registration, sweep
  orchestration, and task selection logic.
- **Turn the service into a queue or scheduler:** Rejected because queueing and
  background orchestration would blur the service boundary and make the module
  harder to copy into other codebases.
- **Move the orchestration into `service-ingress`:** Rejected because
  `service-ingress` is transport infrastructure, while reconciliation remains
  the domain logic owned by `task-reconciler`.
- **Use `incoming-hook` as the central trigger surface:** Rejected because
  `incoming-hook` is for external verified events; it should remain a bridge
  into reconciliation, not the place where central reconciliation semantics
  live.

---

## Constraints

- `src/services/task-reconciler/` remains generic, reusable, and copy-paste
  friendly.
- `TaskReconciler` models desired-vs-applied state convergence; do not reframe
  it as a generic trigger bus or fire-and-forget helper.
- `desiredRevision` remains an opaque caller-provided string; do not add
  semantic-version ordering, date arithmetic, or custom precedence rules.
- Persist reconciliation state through `AbstractKeyValueService`; do not couple
  the service to one database, ORM, queue, or framework.
- Use `AbstractMutex` for concurrency control; do not rely on KV reads and
  writes alone for duplicate prevention.
- Successful reconciliation is the only operation that may advance
  `appliedRevision`; failures preserve the prior applied revision.
- `reconcileAll(...)` is deterministic and sequential in registry order in v1;
  no parallel fan-out.
- If one task fails during a sweep, the reconciler records the failure for that
  task and continues the remaining tasks.
- `TaskReconciler` does not own job scheduling, background workers, DAG
  orchestration, or retry policy beyond the lock lifecycle in this phase.
- Internal trigger endpoints belong in `service-ingress`; external verified
  events continue to flow through `incoming-hook` and may map into
  `checkTask(...)`, `reconcileTask(...)`, or `reconcileAll(...)` from caller
  code.

---

## Consequences

**Positive:** Edge Kit has a reusable operational control-loop primitive that
can reconcile a known task set in one place, while still allowing direct
per-task access for callers that need it.

**Negative:** The service is more opinionated about task registration and sweep
semantics. Consumers must define their task registry up front and accept
sequential central reconciliation semantics.

**Tech debt deferred or created:** Built-in scheduling, persistent sweep
history, parallel task execution, and retry orchestration remain intentionally
deferred. If those are introduced later, they should build on this
registry-based reconciler rather than replace its core state model without a
new ADR.

---

## Assumptions and Defaults

- Assumes callers can provide stable task names and stable desired revision
  labels for each registered task.
- Assumes the task registry is known at construction time in v1.
- Assumes the task callback can run inline during reconciliation and may enqueue
  follow-up work if needed.
- Assumes persisted reconciliation state does not expire by default.
- Assumes the current repo primitives (`AbstractKeyValueService`,
  `AbstractMutex`, `AbstractLogger`) remain the integration points for v1.
- Assumes `service-ingress` is the preferred transport layer for internal
  trigger endpoints, while `incoming-hook` remains the external event bridge.

---

## Implementation Notes

Implemented in `src/services/task-reconciler/`:

- central registry-aware task definitions and collection-level reconcile/check
  methods
- per-task state transitions, lock rechecks, and failure handling with
  deterministic sweep behavior
- thin service-ingress integration helper for internal `check` and `reconcile`
  trigger modes
- ingress handlers that can return JSON bodies so sweep summaries can flow back
  through the shared endpoint

---

## User Flow / Public API / Contract Changes

Before:

- Callers invoked `TaskReconciler` one task at a time with `taskName`,
  `desiredRevision`, and `run(...)`.
- The service had no notion of a central task registry or sweep-level summary
  contract.

After:

- `TaskReconciler` is constructed with a registry of task definitions.
- New central methods:
  - `checkAll(...)`
  - `reconcileAll(...)`
- New task-level convenience methods:
  - `checkTask(taskName, ...)`
  - `reconcileTask(taskName, ...)`
- Top-level results include summary counts plus per-task entries for check and
  execute sweeps.

Representative task definition shape:

```ts
type TaskDefinition = {
  taskName: string;
  resolveDesiredRevision: () => string | Promise<string>;
  run: (ctx: TaskReconcilerExecutionContext) => Promise<void>;
  metadata?: Record<string, unknown>;
};
```

Representative sweep result shape:

```ts
type ReconcileAllResult = {
  outcome: 'completed';
  summary: {
    checked: number;
    executed: number;
    skipped: number;
    failed: number;
  };
  results: Array<{
    taskName: string;
    outcome: 'skipped' | 'executed' | 'failed';
    reason?: 'up-to-date';
  }>;
};
```

External verified events still do not own reconciliation semantics; they
continue to map into task reconciliation from caller code or thin transport
helpers.

---

## Related ADRs

- [ADR-0004] Add a TaskReconciler Service for versioned operational work
- [ADR-0005] Add a generic incoming-hook toolkit for verified third-party and
  CI posts
- [ADR-0009] Add a dedicated service-ingress service for shared-endpoint
  dispatch
