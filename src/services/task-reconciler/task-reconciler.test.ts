import { describe, expect, it } from 'vitest';

import { InMemoryKeyValueService } from '../key-value/in-memory-key-value';
import { AbstractMutex, type AcquireResult } from '../mutex/abstract-mutex';
import { KvMutex } from '../mutex/mutex-kv';
import {
  createServiceIngressHandler,
  sendServiceIngress,
} from '../service-ingress/service-ingress';
import { defineTaskReconcilerServiceIngress } from './service-ingress-trigger';
import { TaskReconciler } from './task-reconciler';

class RecordingMutex extends AbstractMutex<string> {
  refreshCalls = 0;
  private readonly token = 'recording-token';

  async acquire(): Promise<AcquireResult> {
    return {
      token: this.token,
    };
  }

  async release(_name: string, token: string): Promise<boolean> {
    return token === this.token;
  }

  async refresh(_name: string, token: string): Promise<boolean> {
    if (token !== this.token) {
      return false;
    }

    this.refreshCalls += 1;
    return true;
  }
}

describe('TaskReconciler', () => {
  it('reconciles on first execution and persists succeeded state', async () => {
    const kv = new InMemoryKeyValueService();
    const reconciler = new TaskReconciler({
      kv,
      mutex: new RecordingMutex(),
    });

    const result = await reconciler.reconcile({
      desiredRevision: 'docs-index-v1',
      metadata: { scope: 'documents' },
      async run() {},
      taskName: 'documents-index',
    });

    expect(result.outcome).toBe('executed');
    expect(result.runId).toBeTypeOf('string');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.state).toMatchObject({
      appliedRevision: 'docs-index-v1',
      lastAttemptedRevision: 'docs-index-v1',
      metadata: { scope: 'documents' },
      status: 'succeeded',
      taskName: 'documents-index',
    });

    const storedState = await reconciler.getState('documents-index');
    expect(storedState).toEqual(result.state);
  });

  it('reports reconciliation reasons', async () => {
    const kv = new InMemoryKeyValueService();
    const reconciler = new TaskReconciler({
      kv,
      mutex: new RecordingMutex(),
    });

    const missing = await reconciler.shouldReconcile({
      desiredRevision: 'sync-v1',
      taskName: 'search-sync',
    });
    expect(missing).toEqual({
      reason: 'missing',
      shouldReconcile: true,
      state: null,
    });

    await reconciler.reconcile({
      desiredRevision: 'sync-v1',
      async run() {},
      taskName: 'search-sync',
    });

    const upToDate = await reconciler.shouldReconcile({
      desiredRevision: 'sync-v1',
      taskName: 'search-sync',
    });
    expect(upToDate.shouldReconcile).toBe(false);
    expect(upToDate.reason).toBe('up-to-date');

    const changed = await reconciler.shouldReconcile({
      desiredRevision: 'sync-v2',
      taskName: 'search-sync',
    });
    expect(changed.shouldReconcile).toBe(true);
    expect(changed.reason).toBe('revision-changed');

    const forced = await reconciler.shouldReconcile({
      desiredRevision: 'sync-v1',
      force: true,
      taskName: 'search-sync',
    });
    expect(forced.shouldReconcile).toBe(true);
    expect(forced.reason).toBe('forced');
  });

  it('skips when the desired revision is already applied', async () => {
    const kv = new InMemoryKeyValueService();
    const reconciler = new TaskReconciler({
      kv,
      mutex: new RecordingMutex(),
    });
    let runCount = 0;

    await reconciler.reconcile({
      desiredRevision: 'docs-index-v1',
      async run() {
        runCount += 1;
      },
      taskName: 'documents-index',
    });

    const result = await reconciler.reconcile({
      desiredRevision: 'docs-index-v1',
      async run() {
        runCount += 1;
      },
      taskName: 'documents-index',
    });

    expect(result.outcome).toBe('skipped');
    expect(result.reason).toBe('up-to-date');
    expect(runCount).toBe(1);
  });

  it('reconciles again when the desired revision changes', async () => {
    const kv = new InMemoryKeyValueService();
    const reconciler = new TaskReconciler({
      kv,
      mutex: new RecordingMutex(),
    });
    const executedRevisions: string[] = [];

    await reconciler.reconcile({
      desiredRevision: 'docs-index-v1',
      async run() {
        executedRevisions.push('docs-index-v1');
      },
      taskName: 'documents-index',
    });

    const result = await reconciler.reconcile({
      desiredRevision: 'docs-index-v2',
      async run() {
        executedRevisions.push('docs-index-v2');
      },
      taskName: 'documents-index',
    });

    expect(result.outcome).toBe('executed');
    expect(result.state.appliedRevision).toBe('docs-index-v2');
    expect(executedRevisions).toEqual(['docs-index-v1', 'docs-index-v2']);
  });

  it('preserves the prior applied revision on failure and retries later', async () => {
    const kv = new InMemoryKeyValueService();
    const reconciler = new TaskReconciler({
      kv,
      mutex: new RecordingMutex(),
    });

    await reconciler.reconcile({
      desiredRevision: 'docs-index-v1',
      async run() {},
      taskName: 'documents-index',
    });

    await expect(
      reconciler.reconcile({
        desiredRevision: 'docs-index-v2',
        async run() {
          throw new Error('rebuild failed');
        },
        taskName: 'documents-index',
      })
    ).rejects.toThrow('rebuild failed');

    const failedState = await reconciler.getState('documents-index');
    expect(failedState).toMatchObject({
      appliedRevision: 'docs-index-v1',
      lastAttemptedRevision: 'docs-index-v2',
      lastError: {
        message: 'rebuild failed',
      },
      status: 'failed',
    });

    const retryResult = await reconciler.reconcile({
      desiredRevision: 'docs-index-v2',
      async run() {},
      taskName: 'documents-index',
    });

    expect(retryResult.outcome).toBe('executed');
    expect(retryResult.state.appliedRevision).toBe('docs-index-v2');
    expect(retryResult.state.status).toBe('succeeded');
  });

  it('supports forced reconciliation even when the revision is current', async () => {
    const kv = new InMemoryKeyValueService();
    const reconciler = new TaskReconciler({
      kv,
      mutex: new RecordingMutex(),
    });
    let runCount = 0;

    await reconciler.reconcile({
      desiredRevision: 'cache-v1',
      async run() {
        runCount += 1;
      },
      taskName: 'cache-rebuild',
    });

    const result = await reconciler.reconcile({
      desiredRevision: 'cache-v1',
      force: true,
      async run() {
        runCount += 1;
      },
      taskName: 'cache-rebuild',
    });

    expect(result.outcome).toBe('executed');
    expect(result.state.appliedRevision).toBe('cache-v1');
    expect(runCount).toBe(2);
  });

  it('refreshes the lease and persists the heartbeat for long-running tasks', async () => {
    const kv = new InMemoryKeyValueService();
    const mutex = new RecordingMutex();
    const reconciler = new TaskReconciler({
      kv,
      mutex,
    });

    await reconciler.reconcile({
      desiredRevision: 'backfill-v1',
      async run(ctx) {
        const refreshed = await ctx.refreshLease();
        expect(refreshed).toBe(true);
      },
      taskName: 'backfill-users',
    });

    const state = await reconciler.getState('backfill-users');
    expect(state?.lastHeartbeatAt).not.toBeNull();
    expect(state?.lastSucceededAt).not.toBeNull();
    expect(mutex.refreshCalls).toBe(1);
  });

  it('rechecks state after lock acquisition so concurrent callers do not double-run', async () => {
    const kv = new InMemoryKeyValueService();
    const mutex = new KvMutex<string>(kv, {
      jitterMs: 1,
      prefix: '',
      retries: 200,
      retryDelayMs: 1,
      ttlSeconds: 5,
    });
    const reconciler = new TaskReconciler({
      kv,
      mutex,
    });
    let runCount = 0;
    let markFirstRunStarted = () => {};
    let releaseFirstRun = () => {};

    const firstRunStarted = new Promise<void>((resolve) => {
      markFirstRunStarted = resolve;
    });
    const firstRunCanFinish = new Promise<void>((resolve) => {
      releaseFirstRun = resolve;
    });

    const first = reconciler.reconcile({
      desiredRevision: 'search-v1',
      async run() {
        runCount += 1;
        markFirstRunStarted();
        await firstRunCanFinish;
      },
      taskName: 'search-sync',
    });

    await firstRunStarted;

    const second = reconciler.reconcile({
      desiredRevision: 'search-v1',
      async run() {
        runCount += 1;
      },
      taskName: 'search-sync',
    });

    releaseFirstRun();

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(runCount).toBe(1);
    expect(firstResult.outcome).toBe('executed');
    expect(secondResult.outcome).toBe('skipped');
    expect(secondResult.reason).toBe('up-to-date');
  });

  it('checks registered tasks through the central registry', async () => {
    const kv = new InMemoryKeyValueService();
    const reconciler = new TaskReconciler({
      kv,
      mutex: new RecordingMutex(),
      tasks: [
        {
          metadata: { scope: 'documents' },
          resolveDesiredRevision() {
            return 'docs-index-v1';
          },
          async run() {},
          taskName: 'documents-index',
        },
        {
          resolveDesiredRevision() {
            return 'cache-v1';
          },
          async run() {},
          taskName: 'cache-rebuild',
        },
      ],
    });

    const initial = await reconciler.checkAll();

    expect(initial.summary).toEqual({
      checked: 2,
      failed: 0,
      stale: 2,
      upToDate: 0,
    });
    expect(initial.results).toMatchObject([
      {
        desiredRevision: 'docs-index-v1',
        metadata: { scope: 'documents' },
        reason: 'missing',
        shouldReconcile: true,
        taskName: 'documents-index',
      },
      {
        desiredRevision: 'cache-v1',
        reason: 'missing',
        shouldReconcile: true,
        taskName: 'cache-rebuild',
      },
    ]);

    await reconciler.reconcileTask('documents-index');

    const afterSingleTask = await reconciler.checkAll();

    expect(afterSingleTask.summary).toEqual({
      checked: 2,
      failed: 0,
      stale: 1,
      upToDate: 1,
    });
    expect(afterSingleTask.results).toMatchObject([
      {
        reason: 'up-to-date',
        shouldReconcile: false,
        taskName: 'documents-index',
      },
      {
        reason: 'missing',
        shouldReconcile: true,
        taskName: 'cache-rebuild',
      },
    ]);
  });

  it('reconciles all registered tasks, skipping ones that are already current', async () => {
    const kv = new InMemoryKeyValueService();
    let documentsRevision = 'docs-index-v1';
    let documentsRunCount = 0;
    let cacheRunCount = 0;
    const reconciler = new TaskReconciler({
      kv,
      mutex: new RecordingMutex(),
      tasks: [
        {
          resolveDesiredRevision() {
            return documentsRevision;
          },
          async run() {
            documentsRunCount += 1;
          },
          taskName: 'documents-index',
        },
        {
          resolveDesiredRevision() {
            return 'cache-v1';
          },
          async run() {
            cacheRunCount += 1;
          },
          taskName: 'cache-rebuild',
        },
      ],
    });

    const first = await reconciler.reconcileAll();

    expect(first.summary).toEqual({
      checked: 2,
      executed: 2,
      failed: 0,
      skipped: 0,
    });
    expect(documentsRunCount).toBe(1);
    expect(cacheRunCount).toBe(1);

    documentsRevision = 'docs-index-v2';

    const second = await reconciler.reconcileAll();

    expect(second.summary).toEqual({
      checked: 2,
      executed: 1,
      failed: 0,
      skipped: 1,
    });
    expect(second.results).toMatchObject([
      {
        desiredRevision: 'docs-index-v2',
        outcome: 'executed',
        taskName: 'documents-index',
      },
      {
        desiredRevision: 'cache-v1',
        outcome: 'skipped',
        reason: 'up-to-date',
        taskName: 'cache-rebuild',
      },
    ]);
    expect(documentsRunCount).toBe(2);
    expect(cacheRunCount).toBe(1);
  });

  it('continues reconciling remaining tasks after one registered task fails', async () => {
    const kv = new InMemoryKeyValueService();
    const executedTasks: string[] = [];
    const reconciler = new TaskReconciler({
      kv,
      mutex: new RecordingMutex(),
      tasks: [
        {
          resolveDesiredRevision() {
            return 'docs-index-v1';
          },
          async run() {
            executedTasks.push('documents-index');
          },
          taskName: 'documents-index',
        },
        {
          resolveDesiredRevision() {
            return 'cache-v1';
          },
          async run() {
            throw new Error('cache rebuild failed');
          },
          taskName: 'cache-rebuild',
        },
        {
          resolveDesiredRevision() {
            return 'search-v1';
          },
          async run() {
            executedTasks.push('search-sync');
          },
          taskName: 'search-sync',
        },
      ],
    });

    const result = await reconciler.reconcileAll();

    expect(result.summary).toEqual({
      checked: 3,
      executed: 2,
      failed: 1,
      skipped: 0,
    });
    expect(executedTasks).toEqual(['documents-index', 'search-sync']);
    expect(result.results).toMatchObject([
      {
        outcome: 'executed',
        taskName: 'documents-index',
      },
      {
        error: {
          message: 'cache rebuild failed',
        },
        outcome: 'failed',
        taskName: 'cache-rebuild',
      },
      {
        outcome: 'executed',
        taskName: 'search-sync',
      },
    ]);
    expect(await reconciler.getState('cache-rebuild')).toMatchObject({
      appliedRevision: null,
      lastAttemptedRevision: 'cache-v1',
      status: 'failed',
    });
  });

  it('supports service-ingress trigger modes for check and reconcile sweeps', async () => {
    const kv = new InMemoryKeyValueService();
    let runCount = 0;
    const reconciler = new TaskReconciler({
      kv,
      mutex: new RecordingMutex(),
      tasks: [
        {
          resolveDesiredRevision() {
            return 'docs-index-v1';
          },
          async run() {
            runCount += 1;
          },
          taskName: 'documents-index',
        },
      ],
    });
    const handler = createServiceIngressHandler({
      ingresses: [
        defineTaskReconcilerServiceIngress({
          reconciler,
        }),
      ],
      secrets: ['service-secret'],
    });
    const fetchMock: typeof fetch = async (input, init) =>
      await handler(new Request(String(input), init));

    const checkResponse = await sendServiceIngress({
      fetch: fetchMock,
      ingress: defineTaskReconcilerServiceIngress({
        reconciler,
      }),
      params: {
        mode: 'check',
      },
      secret: 'service-secret',
      url: 'https://example.com/api/internal/service-ingress',
    });

    expect(await checkResponse.json()).toMatchObject({
      mode: 'check',
      result: {
        summary: {
          checked: 1,
          failed: 0,
          stale: 1,
          upToDate: 0,
        },
      },
    });

    const reconcileResponse = await sendServiceIngress({
      fetch: fetchMock,
      ingress: defineTaskReconcilerServiceIngress({
        reconciler,
      }),
      params: {
        mode: 'reconcile',
      },
      secret: 'service-secret',
      url: 'https://example.com/api/internal/service-ingress',
    });

    expect(await reconcileResponse.json()).toMatchObject({
      mode: 'reconcile',
      result: {
        summary: {
          checked: 1,
          executed: 1,
          failed: 0,
          skipped: 0,
        },
      },
    });
    expect(runCount).toBe(1);
  });

  it('rechecks state during concurrent reconcileAll sweeps so a stale task runs once', async () => {
    const kv = new InMemoryKeyValueService();
    const mutex = new KvMutex<string>(kv, {
      jitterMs: 1,
      prefix: '',
      retries: 200,
      retryDelayMs: 1,
      ttlSeconds: 5,
    });
    let runCount = 0;
    let markFirstRunStarted = () => {};
    let releaseFirstRun = () => {};

    const firstRunStarted = new Promise<void>((resolve) => {
      markFirstRunStarted = resolve;
    });
    const firstRunCanFinish = new Promise<void>((resolve) => {
      releaseFirstRun = resolve;
    });

    const reconciler = new TaskReconciler({
      kv,
      mutex,
      tasks: [
        {
          resolveDesiredRevision() {
            return 'search-v1';
          },
          async run() {
            runCount += 1;
            markFirstRunStarted();
            await firstRunCanFinish;
          },
          taskName: 'search-sync',
        },
      ],
    });

    const first = reconciler.reconcileAll();
    await firstRunStarted;

    const second = reconciler.reconcileAll();

    releaseFirstRun();

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(runCount).toBe(1);
    expect(firstResult.summary).toEqual({
      checked: 1,
      executed: 1,
      failed: 0,
      skipped: 0,
    });
    expect(secondResult.summary).toEqual({
      checked: 1,
      executed: 0,
      failed: 0,
      skipped: 1,
    });
  });
});
