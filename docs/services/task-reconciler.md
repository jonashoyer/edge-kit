# Task Reconciler

The `TaskReconciler` service provides a central registry-based way to run
operational work only when a desired revision differs from the last
successfully applied revision.

This is useful for tasks such as:

- document reindexing
- cache rebuilds
- search syncs
- data backfills

## Overview

`TaskReconciler` is a reconciliation primitive, not a queue or scheduler.

Callers register task definitions up front. Each task definition provides:

- `taskName`: the stable name of the operational task
- `resolveDesiredRevision()`: the caller-owned revision label to converge toward
- `run`: the callback that performs the work

The service stores durable reconciliation state in a key-value store and uses
a mutex to ensure only one caller executes the same task at a time.

You can use it in three ways:

- `checkAll()` and `reconcileAll()` to sweep the full registry
- `checkTask(taskName)` and `reconcileTask(taskName)` for one registered task
- `shouldReconcile()` and `reconcile()` for direct ad hoc compatibility

## Dependencies

- `AbstractKeyValueService`
- `AbstractMutex`
- optional `AbstractLogger`

## Registered Tasks

```typescript
import { InMemoryKeyValueService } from '../services/key-value/in-memory-key-value';
import { KvMutex } from '../services/mutex/mutex-kv';
import { TaskReconciler } from '../services/task-reconciler';

const kv = new InMemoryKeyValueService();
const mutex = new KvMutex<string>(kv, { prefix: '', ttlSeconds: 30 });

const reconciler = new TaskReconciler({
  kv,
  mutex,
  tasks: [
    {
      taskName: 'documents-index',
      resolveDesiredRevision() {
        return 'docs-index-v3';
      },
      async run() {
        await rebuildDocumentIndex();
      },
    },
  ],
});
```

## Sweeping Tasks

```typescript
const check = await reconciler.checkAll();
const result = await reconciler.reconcileAll();

if (result.summary.failed > 0) {
  console.log('One or more tasks failed during the sweep.');
}
```

`reconcileAll()` walks the registry in constructor order, runs only stale
tasks, and continues after individual failures so one bad task does not block
the remaining sweep.

## Inspecting State

Use `getState()` or `shouldReconcile()` when you want a dry check or operator
visibility for a single ad hoc task.

```typescript
const state = await reconciler.getState('documents-index');

const check = await reconciler.shouldReconcile({
  taskName: 'documents-index',
  desiredRevision: 'docs-index-v3',
});

if (check.shouldReconcile) {
  console.log('Reconciliation is needed because:', check.reason);
}
```

## Long-Running Tasks

The `run` callback receives a `refreshLease()` helper. Call it periodically for
long-running tasks so the lock TTL stays fresh.

```typescript
await reconciler.reconcile({
  taskName: 'users-backfill',
  desiredRevision: '2026-03-20-backfill',
  async run(ctx) {
    for (const batch of batches) {
      await processBatch(batch);
      await ctx.refreshLease();
    }
  },
});
```

## Revision Strategy

Use stable semantic labels for `desiredRevision`, for example:

- `docs-index-v3`
- `2026-03-20-reindex`
- `backfill-users-email-normalization`

Do not generate a new timestamp on every call. If the revision changes every
time, the reconciler will always execute.

## Behavior Summary

- First run with no prior state executes.
- Matching `appliedRevision` and `desiredRevision` skips.
- New revisions execute.
- Failed executions do not advance `appliedRevision`.
- `force: true` executes even if the revision is already current.
- `reconcileAll()` continues after individual task failures.

## Internal Trigger Integration

For internal signed trigger requests, use the `service-ingress` helper beside
this feature.

Typical flow:

1. Register the reconciliation tasks up front.
2. Expose a `service-ingress` handler that accepts `check` or `reconcile`.
3. Call `checkAll()` or `reconcileAll()` inside the ingress handler.
4. Return the in-memory sweep summary from the ingress response body.

## External Event Integration

`TaskReconciler` still pairs well with the `incoming-hook` toolkit when an
external system decides when a follow-up task should run.

Typical flow:

1. Verify the inbound request with an `incoming-hook` verifier.
2. Filter the verified event in caller code.
3. Map that event to the reconciler API, either ad hoc or through a registered
   task.
4. Reconcile or enqueue inside the `run` callback.
