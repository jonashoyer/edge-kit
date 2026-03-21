import type { LogMetadata } from '../logging/abstract-logger';

export type TaskReconcilerStatus = 'idle' | 'running' | 'failed' | 'succeeded';

export type TaskReconcilerError = {
  message: string;
  stack?: string;
};

export type TaskReconcilerState = {
  taskName: string;
  appliedRevision: string | null;
  lastAttemptedRevision: string | null;
  status: TaskReconcilerStatus;
  lastRunId: string | null;
  lastStartedAt: string | null;
  lastHeartbeatAt: string | null;
  lastCompletedAt: string | null;
  lastSucceededAt: string | null;
  lastError: TaskReconcilerError | null;
  metadata?: Record<string, unknown>;
};

export type ShouldReconcileReason =
  | 'missing'
  | 'revision-changed'
  | 'forced'
  | 'up-to-date';

export type ShouldReconcileOptions = {
  taskName: string;
  desiredRevision: string;
  force?: boolean;
};

export type ShouldReconcileResult = {
  shouldReconcile: boolean;
  reason: ShouldReconcileReason;
  state: TaskReconcilerState | null;
};

export type TaskReconcilerExecutionContext = {
  runId: string;
  taskName: string;
  desiredRevision: string;
  refreshLease: () => Promise<boolean>;
  loggerMetadata: LogMetadata;
};

export type ReconcileOptions = {
  taskName: string;
  desiredRevision: string;
  force?: boolean;
  metadata?: Record<string, unknown>;
  run: (ctx: TaskReconcilerExecutionContext) => Promise<void>;
};

export type ReconcileResult = {
  outcome: 'skipped' | 'executed';
  reason?: 'up-to-date';
  runId?: string;
  durationMs?: number;
  state: TaskReconcilerState;
};

export type TaskReconcilerTaskDefinition = {
  taskName: string;
  resolveDesiredRevision: () => Promise<string> | string;
  run: (ctx: TaskReconcilerExecutionContext) => Promise<void>;
  metadata?: Record<string, unknown>;
};

export type CheckTaskOptions = {
  force?: boolean;
};

export type CheckTaskResult = ShouldReconcileResult & {
  taskName: string;
  desiredRevision: string;
  metadata?: Record<string, unknown>;
};

export type CheckAllTaskFailure = {
  taskName: string;
  desiredRevision: null;
  outcome: 'failed';
  error: TaskReconcilerError;
  metadata?: Record<string, unknown>;
};

export type CheckAllTaskResult = CheckTaskResult | CheckAllTaskFailure;

export type CheckAllOptions = {
  force?: boolean;
};

export type CheckAllResult = {
  outcome: 'completed';
  summary: {
    checked: number;
    stale: number;
    upToDate: number;
    failed: number;
  };
  results: CheckAllTaskResult[];
};

export type ReconcileTaskOptions = {
  force?: boolean;
};

export type RegisteredTaskReconcileResult = ReconcileResult & {
  taskName: string;
  desiredRevision: string;
  metadata?: Record<string, unknown>;
};

export type ReconcileAllTaskFailure = {
  taskName: string;
  desiredRevision: string | null;
  outcome: 'failed';
  error: TaskReconcilerError;
  state: TaskReconcilerState | null;
  metadata?: Record<string, unknown>;
};

export type ReconcileAllTaskResult =
  | RegisteredTaskReconcileResult
  | ReconcileAllTaskFailure;

export type ReconcileAllOptions = {
  force?: boolean;
};

export type ReconcileAllResult = {
  outcome: 'completed';
  summary: {
    checked: number;
    executed: number;
    skipped: number;
    failed: number;
  };
  results: ReconcileAllTaskResult[];
};

export abstract class AbstractTaskReconciler {
  abstract getState(taskName: string): Promise<TaskReconcilerState | null>;

  abstract shouldReconcile(
    options: ShouldReconcileOptions
  ): Promise<ShouldReconcileResult>;

  abstract checkTask(
    taskName: string,
    options?: CheckTaskOptions
  ): Promise<CheckTaskResult>;

  abstract checkAll(options?: CheckAllOptions): Promise<CheckAllResult>;

  abstract reconcile(options: ReconcileOptions): Promise<ReconcileResult>;

  abstract reconcileTask(
    taskName: string,
    options?: ReconcileTaskOptions
  ): Promise<RegisteredTaskReconcileResult>;

  abstract reconcileAll(
    options?: ReconcileAllOptions
  ): Promise<ReconcileAllResult>;
}
