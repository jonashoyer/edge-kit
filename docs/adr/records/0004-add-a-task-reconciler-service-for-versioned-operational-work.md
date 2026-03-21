# [0004] Add a TaskReconciler Service for Versioned Operational Work

**Status:** `Superseded by [0012]`

**Date:** 2026-03-16

---

## TL;DR

Edge Kit adds a new `src/services/task-reconciler/` service family for
desired-vs-applied revision reconciliation of operational tasks such as
reindexing, backfills, cache rebuilds, and search syncs. This is being added
as a reconciler rather than a trigger service because the core responsibility
is state convergence with durable checkpoints, not fire-and-forget invocation,
and future work must preserve that model instead of introducing product- or
queue-specific orchestration into the service itself.

---

## Decision

Edge Kit implements a dedicated `TaskReconciler` service under
`src/services/task-reconciler/` as the generic primitive for “run this task
only when the desired revision differs from the last successfully applied
revision.” The service will be copy-paste friendly and dependency-light while
using existing runtime primitives through dependency injection:

- `AbstractKeyValueService` for durable reconciliation state
- `AbstractMutex` for concurrency control across callers and processes
- optional `AbstractLogger` for structured operational logging

The service is intentionally a reconciler, not a trigger service. “Trigger”
implies that the public contract is to initiate work. The chosen contract is
instead to compare desired state with recorded applied state, determine whether
work is required, and safely converge the checkpoint to the desired revision if
the supplied callback completes successfully.

The reconciliation key model for v1 is:

- `taskName` identifies the operational task
- `desiredRevision` is an opaque caller-owned string
- `appliedRevision` is the last successfully applied revision

`TaskReconciler` will expose three public operations:

- `getState(taskName)`
- `shouldReconcile({ taskName, desiredRevision, force? })`
- `reconcile({ taskName, desiredRevision, run, force?, metadata? })`

The persisted state record will contain:

- `taskName`
- `appliedRevision`
- `lastAttemptedRevision`
- `status` as `idle | running | failed | succeeded`
- `lastRunId`
- `lastStartedAt`
- `lastHeartbeatAt`
- `lastCompletedAt`
- `lastSucceededAt`
- `lastError`
- `metadata`

The standard execution flow is:

1. Read current state.
2. If `appliedRevision === desiredRevision` and `force !== true`, skip.
3. Acquire a mutex for `taskName`.
4. Re-read state inside the lock and skip again if another caller already
   reconciled it.
5. Mark the task state as `running` with a fresh `runId`.
6. Invoke the caller-provided `run` callback.
7. On success, set `appliedRevision = desiredRevision` and mark `succeeded`.
8. On failure, preserve the prior `appliedRevision`, mark `failed`, store
   error details, and rethrow.

The callback receives a reconciliation context containing `runId`, `taskName`,
`desiredRevision`, `refreshLease()`, and prebuilt logger metadata. The service
executes the callback inline in v1. If a consumer wants background execution,
the callback may enqueue a job, but `TaskReconciler` itself must not own queue
integration, scheduling, or workflow graphs.

Standard internal naming for v1 is:

- state key: `task-reconciler:{taskName}:state`
- lock name: `task-reconciler:{taskName}`

Structured logging event names for v1 are:

- `task-reconciler.check`
- `task-reconciler.skip`
- `task-reconciler.start`
- `task-reconciler.success`
- `task-reconciler.failure`
- `task-reconciler.lock-contention`

### Alternatives Considered

- **InfraTriggerService / trigger-based API:** Rejected because it centers the
  public contract on invoking work rather than reconciling desired and applied
  state.
- **Checkpoint-only helper with no orchestration:** Rejected because callers
  would each reimplement lock discipline, state transitions, and failure
  handling inconsistently.
- **Extend `DrizzleDataMigrationService` for all operational reruns:**
  Rejected because migrations are only one use case and that service is
  database-table specific rather than generic and storage-agnostic.
- **KV state without mutex-backed coordination:** Rejected because plain reads
  and writes do not provide safe single-run behavior across concurrent callers.

---

## Constraints

- `src/services/task-reconciler/` must remain generic, reusable, and
  copy-paste friendly.
- `TaskReconciler` must model desired-vs-applied state convergence. Do not
  rename or reshape the public API around generic triggers, event buses, or
  fire-and-forget semantics in this phase.
- `desiredRevision` must be treated as an opaque caller-provided string. Do
  not add semantic-version ordering, date arithmetic, or custom revision
  precedence rules in v1.
- Persist reconciliation state through `AbstractKeyValueService`; do not couple
  the service to one database, ORM, queue, or framework.
- Use `AbstractMutex` for concurrency control. Do not rely on KV reads and
  writes alone for production-safe duplicate prevention.
- Successful reconciliation is the only operation that may advance
  `appliedRevision`. Failed executions must preserve the previously applied
  revision.
- `TaskReconciler` may expose inspection and run results, but it must not own
  job scheduling, background workers, DAG orchestration, or retry policies
  beyond the lock lifecycle in this phase.
- Logging must stay light, structured, and optional. Do not require a logger to
  use the service.
- Examples and docs must steer callers toward stable revision labels such as
  `docs-index-v3` or `2026-03-16-reindex`, not per-call timestamps.

---

## Consequences

Positive: Edge Kit gains a reusable operational control-loop primitive that is
more general than data migrations and easier to reason about than ad-hoc rerun
flags or deploy hooks. CI and operational code can ask one question
consistently: “is the desired revision already applied?”

Negative: The repo adds a new service family with persisted state and lock
coordination semantics that need careful testing and documentation. Consumers
must choose stable revision identifiers and understand that reconciliation is a
stateful contract, not a one-shot trigger helper.

Tech debt deferred or created: Built-in scheduling, queue adapters, workflow
graphs, audit dashboards, and multi-task dependency orchestration are
explicitly deferred. If those are added later, they should build on
`TaskReconciler` rather than replace its core checkpoint model without a new
ADR.

---

## Assumptions and Defaults

- Assumes callers can provide stable semantic revision labels for the work they
  want reconciled.
- Assumes persisted reconciliation state should not expire by default.
- Assumes lock keys will use TTL and can be refreshed for long-running work.
- Assumes the current repo primitives (`AbstractKeyValueService`,
  `AbstractMutex`, `AbstractLogger`) remain the integration points for v1.
- Assumes inline execution is sufficient for the first phase and that projects
  needing asynchronous execution can enqueue from inside the callback.

---

## Current State

Implemented: `src/services/task-reconciler/` now contains the public contracts,
the main `TaskReconciler` class, and focused tests covering first-run
reconciliation, up-to-date skips, revision changes, forced runs, failure
handling, concurrency rechecks, and lease refresh.

Implemented: `src/services/task-reconciler/FEATURE.md`,
`docs/services/task-reconciler.md`, and README discoverability updates now
document the service and its intended revision-label model.

---

## User Flow / Public API / Contract Changes

Before:

- Edge Kit has a migration-specific `DrizzleDataMigrationService` and several
  ad-hoc KV-backed coordination patterns, but no generic reconciler for
  versioned operational work.

After:

- New generic service family: `src/services/task-reconciler/`
- New public contracts:

```ts
type TaskReconcilerState = {
  taskName: string;
  appliedRevision: string | null;
  lastAttemptedRevision: string | null;
  status: 'idle' | 'running' | 'failed' | 'succeeded';
  lastRunId: string | null;
  lastStartedAt: string | null;
  lastHeartbeatAt: string | null;
  lastCompletedAt: string | null;
  lastSucceededAt: string | null;
  lastError: { message: string; stack?: string } | null;
  metadata?: Record<string, unknown>;
};

type ShouldReconcileResult = {
  shouldReconcile: boolean;
  reason: 'missing' | 'revision-changed' | 'forced' | 'up-to-date';
  state: TaskReconcilerState | null;
};

type ReconcileOptions = {
  taskName: string;
  desiredRevision: string;
  force?: boolean;
  metadata?: Record<string, unknown>;
  run: (ctx: TaskReconcilerExecutionContext) => Promise<void>;
};

type ReconcileResult = {
  outcome: 'skipped' | 'executed';
  reason?: 'up-to-date';
  runId?: string;
  durationMs?: number;
  state: TaskReconcilerState;
};
```

- Example usage model:
  - caller provides `taskName` and `desiredRevision`
  - reconciler skips when already applied
  - reconciler executes the callback only when reconciliation is needed or
    forced

---

## Related ADRs

- ADR-0002 — Add contextualizer, richer storage, and AI runtime support
