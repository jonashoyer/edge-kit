import { serializeError } from '../../utils/error-utils';
import { genId } from '../../utils/id-generator';
import type { AbstractKeyValueService } from '../key-value/abstract-key-value';
import type { AbstractLogger, LogMetadata } from '../logging/abstract-logger';
import type { AbstractMutex } from '../mutex/abstract-mutex';
import {
  AbstractTaskReconciler,
  type CheckAllOptions,
  type CheckAllResult,
  type CheckAllTaskFailure,
  type CheckTaskOptions,
  type CheckTaskResult,
  type ReconcileAllOptions,
  type ReconcileAllResult,
  type ReconcileAllTaskFailure,
  type ReconcileOptions,
  type ReconcileResult,
  type ReconcileTaskOptions,
  type RegisteredTaskReconcileResult,
  type ShouldReconcileOptions,
  type ShouldReconcileReason,
  type ShouldReconcileResult,
  type TaskReconcilerError,
  type TaskReconcilerState,
  type TaskReconcilerTaskDefinition,
} from './abstract-task-reconciler';

const DEFAULT_PREFIX = 'task-reconciler:';
const STATE_SUFFIX = ':state';

export type TaskReconcilerOptions = {
  kv: AbstractKeyValueService;
  mutex: AbstractMutex<string>;
  logger?: AbstractLogger;
  prefix?: string;
  tasks?: readonly TaskReconcilerTaskDefinition[];
};

const assertNonEmptyString = (value: string, label: string) => {
  if (value.trim().length === 0) {
    throw new Error(`TaskReconciler ${label} must not be empty`);
  }
};

const toTaskError = (error: unknown): TaskReconcilerError => {
  const serialized = serializeError(error);

  return {
    message: serialized.message ?? 'Unknown task reconciler error',
    ...(serialized.stack ? { stack: serialized.stack } : {}),
  };
};

type ResolvedRegisteredTask = {
  task: TaskReconcilerTaskDefinition;
  taskName: string;
  desiredRevision: string;
  metadata?: Record<string, unknown>;
};

export class TaskReconciler extends AbstractTaskReconciler {
  private readonly kv: AbstractKeyValueService;
  private readonly mutex: AbstractMutex<string>;
  private readonly logger?: AbstractLogger;
  private readonly prefix: string;
  private readonly tasksByName: ReadonlyMap<
    string,
    TaskReconcilerTaskDefinition
  >;
  private readonly taskOrder: readonly string[];

  constructor(options: TaskReconcilerOptions) {
    super();
    this.kv = options.kv;
    this.mutex = options.mutex;
    this.logger = options.logger;
    this.prefix = options.prefix ?? DEFAULT_PREFIX;
    const registry = this.createTaskRegistry(options.tasks ?? []);
    this.tasksByName = registry.tasksByName;
    this.taskOrder = registry.taskOrder;
  }

  override async getState(
    taskName: string
  ): Promise<TaskReconcilerState | null> {
    this.assertTaskName(taskName);
    return await this.readState(taskName);
  }

  override async shouldReconcile(
    options: ShouldReconcileOptions
  ): Promise<ShouldReconcileResult> {
    this.assertInputs(options.taskName, options.desiredRevision);

    const state = await this.readState(options.taskName);
    const reason = this.resolveReason(
      state,
      options.desiredRevision,
      options.force ?? false
    );

    this.logger?.info('task-reconciler.check', {
      taskName: options.taskName,
      desiredRevision: options.desiredRevision,
      appliedRevision: state?.appliedRevision ?? null,
      forced: options.force ?? false,
      reason,
    });

    return {
      shouldReconcile: reason !== 'up-to-date',
      reason,
      state,
    };
  }

  override async checkTask(
    taskName: string,
    options: CheckTaskOptions = {}
  ): Promise<CheckTaskResult> {
    const resolvedTask = await this.resolveRegisteredTask(taskName);
    const result = await this.shouldReconcile({
      taskName: resolvedTask.taskName,
      desiredRevision: resolvedTask.desiredRevision,
      force: options.force,
    });

    return {
      ...result,
      taskName: resolvedTask.taskName,
      desiredRevision: resolvedTask.desiredRevision,
      ...(resolvedTask.metadata ? { metadata: resolvedTask.metadata } : {}),
    };
  }

  override async checkAll(
    options: CheckAllOptions = {}
  ): Promise<CheckAllResult> {
    const results: CheckAllResult['results'] = [];
    let stale = 0;
    let upToDate = 0;
    let failed = 0;

    for (const taskName of this.taskOrder) {
      try {
        const result = await this.checkTask(taskName, options);
        results.push(result);

        if (result.shouldReconcile) {
          stale += 1;
        } else {
          upToDate += 1;
        }
      } catch (error) {
        const failure = this.createCheckAllTaskFailure(taskName, error);
        results.push(failure);
        failed += 1;
      }
    }

    return {
      outcome: 'completed',
      summary: {
        checked: results.length,
        stale,
        upToDate,
        failed,
      },
      results,
    };
  }

  override async reconcile(
    options: ReconcileOptions
  ): Promise<ReconcileResult> {
    this.assertInputs(options.taskName, options.desiredRevision);

    const initialCheck = await this.shouldReconcile({
      taskName: options.taskName,
      desiredRevision: options.desiredRevision,
      force: options.force,
    });

    if (!initialCheck.shouldReconcile) {
      const state =
        initialCheck.state ??
        this.createEmptyState(options.taskName, options.metadata);

      this.logger?.info('task-reconciler.skip', {
        taskName: options.taskName,
        desiredRevision: options.desiredRevision,
        appliedRevision: state.appliedRevision,
        forced: options.force ?? false,
        reason: initialCheck.reason,
      });

      return {
        outcome: 'skipped',
        reason: 'up-to-date',
        state,
      };
    }

    const lockName = this.buildLockName(options.taskName);
    let token: string | null = null;

    try {
      const acquireResult = await this.mutex.acquire(lockName);
      token = acquireResult.token;
    } catch (error) {
      this.logger?.warn('task-reconciler.lock-contention', {
        taskName: options.taskName,
        desiredRevision: options.desiredRevision,
        forced: options.force ?? false,
        error,
      });
      throw error;
    }

    try {
      const stateAfterLock = await this.readState(options.taskName);
      const reasonAfterLock = this.resolveReason(
        stateAfterLock,
        options.desiredRevision,
        options.force ?? false
      );

      if (reasonAfterLock === 'up-to-date') {
        const state =
          stateAfterLock ??
          this.createEmptyState(options.taskName, options.metadata);

        this.logger?.info('task-reconciler.skip', {
          taskName: options.taskName,
          desiredRevision: options.desiredRevision,
          appliedRevision: state.appliedRevision,
          forced: options.force ?? false,
          reason: reasonAfterLock,
        });

        return {
          outcome: 'skipped',
          reason: 'up-to-date',
          state,
        };
      }

      const runId = genId();
      const startedAt = new Date().toISOString();
      const durationStart = Date.now();
      const metadata = options.metadata ?? stateAfterLock?.metadata;
      const previousAppliedRevision = stateAfterLock?.appliedRevision ?? null;
      let currentState: TaskReconcilerState = {
        taskName: options.taskName,
        appliedRevision: previousAppliedRevision,
        lastAttemptedRevision: options.desiredRevision,
        status: 'running',
        lastRunId: runId,
        lastStartedAt: startedAt,
        lastHeartbeatAt: startedAt,
        lastCompletedAt: stateAfterLock?.lastCompletedAt ?? null,
        lastSucceededAt: stateAfterLock?.lastSucceededAt ?? null,
        lastError: null,
        ...(metadata ? { metadata } : {}),
      };

      await this.writeState(currentState);

      const loggerMetadata: LogMetadata = {
        taskName: options.taskName,
        desiredRevision: options.desiredRevision,
        appliedRevision: previousAppliedRevision,
        runId,
        forced: options.force ?? false,
      };

      this.logger?.info('task-reconciler.start', loggerMetadata);

      const refreshLease = async () => {
        if (token === null) {
          return false;
        }

        const refreshed = await this.mutex.refresh(lockName, token);
        if (!refreshed) {
          return false;
        }

        const heartbeatAt = new Date().toISOString();
        currentState = {
          ...currentState,
          lastHeartbeatAt: heartbeatAt,
        };
        await this.writeState(currentState);
        return true;
      };

      try {
        await options.run({
          runId,
          taskName: options.taskName,
          desiredRevision: options.desiredRevision,
          refreshLease,
          loggerMetadata,
        });

        const completedAt = new Date().toISOString();
        currentState = {
          ...currentState,
          appliedRevision: options.desiredRevision,
          status: 'succeeded',
          lastCompletedAt: completedAt,
          lastHeartbeatAt: completedAt,
          lastSucceededAt: completedAt,
          lastError: null,
        };
        await this.writeState(currentState);

        const durationMs = Date.now() - durationStart;
        this.logger?.info('task-reconciler.success', {
          ...loggerMetadata,
          appliedRevision: currentState.appliedRevision,
          durationMs,
        });

        return {
          outcome: 'executed',
          runId,
          durationMs,
          state: currentState,
        };
      } catch (error) {
        const completedAt = new Date().toISOString();
        currentState = {
          ...currentState,
          appliedRevision: previousAppliedRevision,
          status: 'failed',
          lastCompletedAt: completedAt,
          lastHeartbeatAt: completedAt,
          lastError: toTaskError(error),
        };
        await this.writeState(currentState);

        const durationMs = Date.now() - durationStart;
        this.logger?.error('task-reconciler.failure', {
          ...loggerMetadata,
          durationMs,
          error,
        });
        throw error;
      }
    } finally {
      if (token !== null) {
        await this.mutex.release(lockName, token);
      }
    }
  }

  override async reconcileTask(
    taskName: string,
    options: ReconcileTaskOptions = {}
  ): Promise<RegisteredTaskReconcileResult> {
    const resolvedTask = await this.resolveRegisteredTask(taskName);
    return await this.reconcileResolvedTask(
      resolvedTask,
      options.force ?? false
    );
  }

  override async reconcileAll(
    options: ReconcileAllOptions = {}
  ): Promise<ReconcileAllResult> {
    const results: ReconcileAllResult['results'] = [];
    let executed = 0;
    let skipped = 0;
    let failed = 0;

    for (const taskName of this.taskOrder) {
      let desiredRevision: string | null = null;

      try {
        const resolvedTask = await this.resolveRegisteredTask(taskName);
        desiredRevision = resolvedTask.desiredRevision;
        const result = await this.reconcileResolvedTask(
          resolvedTask,
          options.force ?? false
        );
        results.push(result);

        if (result.outcome === 'executed') {
          executed += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        const failure = await this.createReconcileAllTaskFailure(
          taskName,
          desiredRevision,
          error
        );
        results.push(failure);
        failed += 1;
      }
    }

    return {
      outcome: 'completed',
      summary: {
        checked: results.length,
        executed,
        skipped,
        failed,
      },
      results,
    };
  }

  private assertTaskName(taskName: string) {
    assertNonEmptyString(taskName, 'taskName');
  }

  private assertInputs(taskName: string, desiredRevision: string) {
    this.assertTaskName(taskName);
    assertNonEmptyString(desiredRevision, 'desiredRevision');
  }

  private getRegisteredTask(taskName: string) {
    const task = this.tasksByName.get(taskName);
    if (!task) {
      throw new Error(`Unknown TaskReconciler task: ${taskName}`);
    }

    return task;
  }

  private buildStateKey(taskName: string) {
    return `${this.prefix}${taskName}${STATE_SUFFIX}`;
  }

  private buildLockName(taskName: string) {
    return `${this.prefix}${taskName}`;
  }

  private async readState(taskName: string) {
    return await this.kv.get<TaskReconcilerState>(this.buildStateKey(taskName));
  }

  private async writeState(state: TaskReconcilerState) {
    await this.kv.set(this.buildStateKey(state.taskName), state);
  }

  private resolveReason(
    state: TaskReconcilerState | null,
    desiredRevision: string,
    force: boolean
  ): ShouldReconcileReason {
    if (force) {
      return 'forced';
    }
    if (state === null) {
      return 'missing';
    }
    if (state.appliedRevision === desiredRevision) {
      return 'up-to-date';
    }
    return 'revision-changed';
  }

  private createTaskRegistry(tasks: readonly TaskReconcilerTaskDefinition[]) {
    const tasksByName = new Map<string, TaskReconcilerTaskDefinition>();
    const taskOrder: string[] = [];

    for (const task of tasks) {
      this.assertTaskName(task.taskName);
      if (tasksByName.has(task.taskName)) {
        throw new Error(`Duplicate TaskReconciler task: ${task.taskName}`);
      }

      tasksByName.set(task.taskName, task);
      taskOrder.push(task.taskName);
    }

    return {
      tasksByName,
      taskOrder,
    };
  }

  private async resolveRegisteredTask(
    taskName: string
  ): Promise<ResolvedRegisteredTask> {
    const task = this.getRegisteredTask(taskName);
    const desiredRevision = await task.resolveDesiredRevision();
    this.assertInputs(task.taskName, desiredRevision);

    return {
      task,
      taskName: task.taskName,
      desiredRevision,
      metadata: task.metadata,
    };
  }

  private async reconcileResolvedTask(
    resolvedTask: ResolvedRegisteredTask,
    force: boolean
  ): Promise<RegisteredTaskReconcileResult> {
    const result = await this.reconcile({
      taskName: resolvedTask.taskName,
      desiredRevision: resolvedTask.desiredRevision,
      force,
      metadata: resolvedTask.metadata,
      run: resolvedTask.task.run,
    });

    return {
      ...result,
      taskName: resolvedTask.taskName,
      desiredRevision: resolvedTask.desiredRevision,
      ...(resolvedTask.metadata ? { metadata: resolvedTask.metadata } : {}),
    };
  }

  private createCheckAllTaskFailure(
    taskName: string,
    error: unknown
  ): CheckAllTaskFailure {
    const task = this.tasksByName.get(taskName);

    return {
      taskName,
      desiredRevision: null,
      outcome: 'failed',
      error: toTaskError(error),
      ...(task?.metadata ? { metadata: task.metadata } : {}),
    };
  }

  private async createReconcileAllTaskFailure(
    taskName: string,
    desiredRevision: string | null,
    error: unknown
  ): Promise<ReconcileAllTaskFailure> {
    const task = this.tasksByName.get(taskName);
    const state = await this.readState(taskName);

    return {
      taskName,
      desiredRevision: desiredRevision ?? state?.lastAttemptedRevision ?? null,
      outcome: 'failed',
      error: toTaskError(error),
      state,
      ...(task?.metadata ? { metadata: task.metadata } : {}),
    };
  }

  private createEmptyState(
    taskName: string,
    metadata?: Record<string, unknown>
  ): TaskReconcilerState {
    return {
      taskName,
      appliedRevision: null,
      lastAttemptedRevision: null,
      status: 'idle',
      lastRunId: null,
      lastStartedAt: null,
      lastHeartbeatAt: null,
      lastCompletedAt: null,
      lastSucceededAt: null,
      lastError: null,
      ...(metadata ? { metadata } : {}),
    };
  }
}
