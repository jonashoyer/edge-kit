import { describe, expect, it } from 'vitest';

import { InMemoryKeyValueService } from '../key-value/in-memory-key-value';
import { AbstractMutex, type AcquireResult } from '../mutex/abstract-mutex';
import { KvMutex } from '../mutex/mutex-kv';
import {
  createServiceIngressHandler,
  sendServiceIngress,
} from '../service-ingress';
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
      taskName: 'documents-index',
      desiredRevision: 'docs-index-v1',
      metadata: { scope: 'documents' },
      async run() {},
    });

    expect(result.outcome).toBe('executed');
    expect(result.runId).toBeTypeOf('string');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.state).toMatchObject({
      taskName: 'documents-index',
      appliedRevision: 'docs-index-v1',
      lastAttemptedRevision: 'docs-index-v1',
      status: 'succeeded',
      metadata: { scope: 'documents' },
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
      taskName: 'search-sync',
      desiredRevision: 'sync-v1',
    });
    expect(missing).toEqual({
      shouldReconcile: true,
      reason: 'missing',
      state: null,
    });

    await reconciler.reconcile({
      taskName: 'search-sync',
      desiredRevision: 'sync-v1',
      async run() {},
    });

    const upToDate = await reconciler.shouldReconcile({
      taskName: 'search-sync',
      desiredRevision: 'sync-v1',
    });
    expect(upToDate.shouldReconcile).toBe(false);
    expect(upToDate.reason).toBe('up-to-date');

    const changed = await reconciler.shouldReconcile({
      taskName: 'search-sync',
      desiredRevision: 'sync-v2',
    });
    expect(changed.shouldReconcile).toBe(true);
    expect(changed.reason).toBe('revision-changed');

    const forced = await reconciler.shouldReconcile({
      taskName: 'search-sync',
      desiredRevision: 'sync-v1',
      force: true,
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
      taskName: 'documents-index',
      desiredRevision: 'docs-index-v1',
      async run() {
        runCount += 1;
      },
    });

    const result = await reconciler.reconcile({
      taskName: 'documents-index',
      desiredRevision: 'docs-index-v1',
      async run() {
        runCount += 1;
      },
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
      taskName: 'documents-index',
      desiredRevision: 'docs-index-v1',
      async run() {
        executedRevisions.push('docs-index-v1');
      },
    });

    const result = await reconciler.reconcile({
      taskName: 'documents-index',
      desiredRevision: 'docs-index-v2',
      async run() {
        executedRevisions.push('docs-index-v2');
      },
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
      taskName: 'documents-index',
      desiredRevision: 'docs-index-v1',
      async run() {},
    });

    await expect(
      reconciler.reconcile({
        taskName: 'documents-index',
        desiredRevision: 'docs-index-v2',
        async run() {
          throw new Error('rebuild failed');
        },
      })
    ).rejects.toThrow('rebuild failed');

    const failedState = await reconciler.getState('documents-index');
    expect(failedState).toMatchObject({
      appliedRevision: 'docs-index-v1',
      lastAttemptedRevision: 'docs-index-v2',
      status: 'failed',
      lastError: {
        message: 'rebuild failed',
      },
    });

    const retryResult = await reconciler.reconcile({
      taskName: 'documents-index',
      desiredRevision: 'docs-index-v2',
      async run() {},
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
      taskName: 'cache-rebuild',
      desiredRevision: 'cache-v1',
      async run() {
        runCount += 1;
      },
    });

    const result = await reconciler.reconcile({
      taskName: 'cache-rebuild',
      desiredRevision: 'cache-v1',
      force: true,
      async run() {
        runCount += 1;
      },
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
      taskName: 'backfill-users',
      desiredRevision: 'backfill-v1',
      async run(ctx) {
        const refreshed = await ctx.refreshLease();
        expect(refreshed).toBe(true);
      },
    });

    const state = await reconciler.getState('backfill-users');
    expect(state?.lastHeartbeatAt).not.toBeNull();
    expect(state?.lastSucceededAt).not.toBeNull();
    expect(mutex.refreshCalls).toBe(1);
  });

  it('rechecks state after lock acquisition so concurrent callers do not double-run', async () => {
    const kv = new InMemoryKeyValueService();
    const mutex = new KvMutex<string>(kv, {
      prefix: '',
      ttlSeconds: 5,
      retries: 200,
      retryDelayMs: 1,
      jitterMs: 1,
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
      taskName: 'search-sync',
      desiredRevision: 'search-v1',
      async run() {
        runCount += 1;
        markFirstRunStarted();
        await firstRunCanFinish;
      },
    });

    await firstRunStarted;

    const second = reconciler.reconcile({
      taskName: 'search-sync',
      desiredRevision: 'search-v1',
      async run() {
        runCount += 1;
      },
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
          taskName: 'documents-index',
          resolveDesiredRevision() {
            return 'docs-index-v1';
          },
          metadata: { scope: 'documents' },
          async run() {},
        },
        {
          taskName: 'cache-rebuild',
          resolveDesiredRevision() {
            return 'cache-v1';
          },
          async run() {},
        },
      ],
    });

    const initial = await reconciler.checkAll();

    expect(initial.summary).toEqual({
      checked: 2,
      stale: 2,
      upToDate: 0,
      failed: 0,
    });
    expect(initial.results).toMatchObject([
      {
        taskName: 'documents-index',
        desiredRevision: 'docs-index-v1',
        shouldReconcile: true,
        reason: 'missing',
        metadata: { scope: 'documents' },
      },
      {
        taskName: 'cache-rebuild',
        desiredRevision: 'cache-v1',
        shouldReconcile: true,
        reason: 'missing',
      },
    ]);

    await reconciler.reconcileTask('documents-index');

    const afterSingleTask = await reconciler.checkAll();

    expect(afterSingleTask.summary).toEqual({
      checked: 2,
      stale: 1,
      upToDate: 1,
      failed: 0,
    });
    expect(afterSingleTask.results).toMatchObject([
      {
        taskName: 'documents-index',
        reason: 'up-to-date',
        shouldReconcile: false,
      },
      {
        taskName: 'cache-rebuild',
        reason: 'missing',
        shouldReconcile: true,
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
          taskName: 'documents-index',
          resolveDesiredRevision() {
            return documentsRevision;
          },
          async run() {
            documentsRunCount += 1;
          },
        },
        {
          taskName: 'cache-rebuild',
          resolveDesiredRevision() {
            return 'cache-v1';
          },
          async run() {
            cacheRunCount += 1;
          },
        },
      ],
    });

    const first = await reconciler.reconcileAll();

    expect(first.summary).toEqual({
      checked: 2,
      executed: 2,
      skipped: 0,
      failed: 0,
    });
    expect(documentsRunCount).toBe(1);
    expect(cacheRunCount).toBe(1);

    documentsRevision = 'docs-index-v2';

    const second = await reconciler.reconcileAll();

    expect(second.summary).toEqual({
      checked: 2,
      executed: 1,
      skipped: 1,
      failed: 0,
    });
    expect(second.results).toMatchObject([
      {
        taskName: 'documents-index',
        desiredRevision: 'docs-index-v2',
        outcome: 'executed',
      },
      {
        taskName: 'cache-rebuild',
        desiredRevision: 'cache-v1',
        outcome: 'skipped',
        reason: 'up-to-date',
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
          taskName: 'documents-index',
          resolveDesiredRevision() {
            return 'docs-index-v1';
          },
          async run() {
            executedTasks.push('documents-index');
          },
        },
        {
          taskName: 'cache-rebuild',
          resolveDesiredRevision() {
            return 'cache-v1';
          },
          async run() {
            throw new Error('cache rebuild failed');
          },
        },
        {
          taskName: 'search-sync',
          resolveDesiredRevision() {
            return 'search-v1';
          },
          async run() {
            executedTasks.push('search-sync');
          },
        },
      ],
    });

    const result = await reconciler.reconcileAll();

    expect(result.summary).toEqual({
      checked: 3,
      executed: 2,
      skipped: 0,
      failed: 1,
    });
    expect(executedTasks).toEqual(['documents-index', 'search-sync']);
    expect(result.results).toMatchObject([
      {
        taskName: 'documents-index',
        outcome: 'executed',
      },
      {
        taskName: 'cache-rebuild',
        outcome: 'failed',
        error: {
          message: 'cache rebuild failed',
        },
      },
      {
        taskName: 'search-sync',
        outcome: 'executed',
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
          taskName: 'documents-index',
          resolveDesiredRevision() {
            return 'docs-index-v1';
          },
          async run() {
            runCount += 1;
          },
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
    const fetchMock: typeof fetch = async (input, init) => {
      return await handler(new Request(String(input), init));
    };

    const checkResponse = await sendServiceIngress({
      url: 'https://example.com/api/internal/service-ingress',
      secret: 'service-secret',
      ingress: defineTaskReconcilerServiceIngress({
        reconciler,
      }),
      params: {
        mode: 'check',
      },
      fetch: fetchMock,
    });

    expect(await checkResponse.json()).toMatchObject({
      mode: 'check',
      result: {
        summary: {
          checked: 1,
          stale: 1,
          upToDate: 0,
          failed: 0,
        },
      },
    });

    const reconcileResponse = await sendServiceIngress({
      url: 'https://example.com/api/internal/service-ingress',
      secret: 'service-secret',
      ingress: defineTaskReconcilerServiceIngress({
        reconciler,
      }),
      params: {
        mode: 'reconcile',
      },
      fetch: fetchMock,
    });

    expect(await reconcileResponse.json()).toMatchObject({
      mode: 'reconcile',
      result: {
        summary: {
          checked: 1,
          executed: 1,
          skipped: 0,
          failed: 0,
        },
      },
    });
    expect(runCount).toBe(1);
  });

  it('rechecks state during concurrent reconcileAll sweeps so a stale task runs once', async () => {
    const kv = new InMemoryKeyValueService();
    const mutex = new KvMutex<string>(kv, {
      prefix: '',
      ttlSeconds: 5,
      retries: 200,
      retryDelayMs: 1,
      jitterMs: 1,
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
          taskName: 'search-sync',
          resolveDesiredRevision() {
            return 'search-v1';
          },
          async run() {
            runCount += 1;
            markFirstRunStarted();
            await firstRunCanFinish;
          },
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
      skipped: 0,
      failed: 0,
    });
    expect(secondResult.summary).toEqual({
      checked: 1,
      executed: 0,
      skipped: 1,
      failed: 0,
    });
  });
});
