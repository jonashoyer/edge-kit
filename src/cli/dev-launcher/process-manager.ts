import { spawn } from 'node:child_process';
import {
  resolveCommandCwd,
  resolveWorkspacePackageDirectoryByName,
  resolveWorkspacePackageDirectoryByPath,
} from './repo-utils';
import type {
  DevLauncherLogEntry,
  DevLauncherLogStream,
  DevLauncherSpawnSpec,
  DevLauncherSupervisorSnapshot,
  LoadedDevLauncherManifest,
  ManagedDevServiceState,
} from './types';

const DEFAULT_LOG_BUFFER_SIZE = 400;
const LINE_SPLIT_REGEX = /\r?\n/u;
const STOP_TIMEOUT_MS = 4000;

interface ReadableLike {
  on: (event: 'data', listener: (chunk: Buffer | string) => void) => void;
}

export interface SpawnedDevProcess {
  kill: (signal?: NodeJS.Signals | number) => boolean;
  on: (
    event: 'error' | 'exit',
    listener: (...args: unknown[]) => void
  ) => SpawnedDevProcess;
  pid?: number;
  stderr: ReadableLike | null;
  stdout: ReadableLike | null;
}

interface SpawnOptionsLike {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdio: ['ignore', 'pipe', 'pipe'];
}

export interface DevLauncherProcessManagerRuntime {
  clearTimeout: (timeout: NodeJS.Timeout) => void;
  env: NodeJS.ProcessEnv;
  now: () => number;
  platform: NodeJS.Platform;
  setTimeout: (callback: () => void, delay: number) => NodeJS.Timeout;
  spawn: (
    command: string,
    args: string[],
    options: SpawnOptionsLike
  ) => SpawnedDevProcess;
}

interface RunningChildState {
  child: SpawnedDevProcess;
  exitPromise: Promise<void>;
  resolveExit: () => void;
  runId: number;
  stopRequested: boolean;
  stopTimeout: NodeJS.Timeout | null;
  streamRemainders: Record<'stderr' | 'stdout', string>;
}

class RingBuffer<T> {
  readonly #capacity: number;
  readonly #items: T[] = [];

  constructor(capacity: number) {
    this.#capacity = Math.max(capacity, 1);
  }

  push(item: T): void {
    this.#items.push(item);

    if (this.#items.length > this.#capacity) {
      this.#items.shift();
    }
  }

  toArray(): T[] {
    return [...this.#items];
  }
}

const defaultRuntime: DevLauncherProcessManagerRuntime = {
  clearTimeout,
  env: process.env,
  now: () => Date.now(),
  platform: process.platform,
  setTimeout,
  spawn: (command, args, options) => {
    return spawn(command, args, options);
  },
};

const getPackageManagerCommand = (
  packageManager: LoadedDevLauncherManifest['packageManager'],
  platform: NodeJS.Platform
): string => {
  if (packageManager === 'pnpm') {
    return platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  }

  throw new Error(`Unsupported package manager "${packageManager}".`);
};

const createInitialServiceState = (
  serviceId: string,
  now: number
): ManagedDevServiceState => ({
  exitCode: null,
  exitSignal: null,
  lastStartedAt: null,
  lastStoppedAt: null,
  lastUpdatedAt: now,
  pid: null,
  runId: 0,
  serviceId,
  status: 'idle',
});

const createInitialServiceStateMap = (
  manifest: LoadedDevLauncherManifest,
  now: number
): Record<string, ManagedDevServiceState> => {
  return Object.fromEntries(
    manifest.serviceIdsInOrder.map((serviceId) => [
      serviceId,
      createInitialServiceState(serviceId, now),
    ])
  ) as Record<string, ManagedDevServiceState>;
};

/**
 * Builds the concrete child-process spawn spec for a service defined in the
 * dev-launcher manifest.
 */
export const buildDevLauncherSpawnSpec = (
  manifest: LoadedDevLauncherManifest,
  serviceId: string,
  platform: NodeJS.Platform = process.platform
): DevLauncherSpawnSpec => {
  const service = manifest.servicesById[serviceId];
  if (!service) {
    throw new Error(`Unknown dev service "${serviceId}".`);
  }

  switch (service.target.kind) {
    case 'root-script':
      return {
        args: ['run', service.target.script],
        command: getPackageManagerCommand(manifest.packageManager, platform),
        cwd: manifest.repoRoot,
        serviceId,
      };
    case 'workspace-script': {
      const cwd = service.target.packageName
        ? resolveWorkspacePackageDirectoryByName(
            manifest.repoRoot,
            service.target.packageName
          )
        : resolveWorkspacePackageDirectoryByPath(
            manifest.repoRoot,
            service.target.packagePath as string
          );

      return {
        args: ['run', service.target.script],
        command: getPackageManagerCommand(manifest.packageManager, platform),
        cwd,
        serviceId,
      };
    }
    case 'command':
      return {
        args: service.target.args ?? [],
        command: service.target.command,
        cwd: resolveCommandCwd(manifest.repoRoot, service.target.cwd),
        serviceId,
      };
    default:
      throw new Error(`Unsupported target for dev service "${serviceId}".`);
  }
};

export interface DevLauncherProcessController {
  applyServiceSet: (serviceIds: Iterable<string>) => Promise<void>;
  getSnapshot: () => DevLauncherSupervisorSnapshot;
  restartService: (serviceId: string) => Promise<void>;
  startService: (serviceId: string) => Promise<void>;
  stopAll: () => Promise<void>;
  stopService: (serviceId: string) => Promise<void>;
  subscribe: (listener: () => void) => () => void;
  waitUntilIdle: () => Promise<void>;
}

/**
 * Supervises one child process per selected service and keeps bounded in-memory
 * logs for both the split dashboard and focused log mode.
 */
export class DevLauncherProcessManager implements DevLauncherProcessController {
  readonly #allLogs: RingBuffer<DevLauncherLogEntry>;
  readonly #childStates = new Map<string, RunningChildState>();
  readonly #listeners = new Set<() => void>();
  readonly #logBuffers: Record<string, RingBuffer<DevLauncherLogEntry>>;
  readonly #manifest: LoadedDevLauncherManifest;
  readonly #operations = new Map<string, Promise<void>>();
  readonly #runtime: DevLauncherProcessManagerRuntime;
  #logSequence = 0;
  #managedServiceIds: string[] = [];
  #serviceStates: Record<string, ManagedDevServiceState>;

  constructor(
    manifest: LoadedDevLauncherManifest,
    runtime: DevLauncherProcessManagerRuntime = defaultRuntime,
    options?: {
      logBufferSize?: number;
    }
  ) {
    const now = runtime.now();
    const logBufferSize =
      options?.logBufferSize ??
      manifest.ui?.logBufferLines ??
      DEFAULT_LOG_BUFFER_SIZE;

    this.#manifest = manifest;
    this.#runtime = runtime;
    this.#serviceStates = createInitialServiceStateMap(manifest, now);
    this.#allLogs = new RingBuffer<DevLauncherLogEntry>(
      logBufferSize * (manifest.serviceIdsInOrder.length + 1)
    );
    this.#logBuffers = Object.fromEntries(
      manifest.serviceIdsInOrder.map((serviceId) => [
        serviceId,
        new RingBuffer<DevLauncherLogEntry>(logBufferSize),
      ])
    ) as Record<string, RingBuffer<DevLauncherLogEntry>>;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  getSnapshot(): DevLauncherSupervisorSnapshot {
    return {
      allLogs: this.#allLogs.toArray(),
      logsByServiceId: Object.fromEntries(
        this.#manifest.serviceIdsInOrder.map((serviceId) => [
          serviceId,
          this.#logBuffers[serviceId].toArray(),
        ])
      ) as Record<string, DevLauncherLogEntry[]>,
      managedServiceIds: [...this.#managedServiceIds],
      serviceStates: Object.fromEntries(
        Object.entries(this.#serviceStates).map(([serviceId, state]) => [
          serviceId,
          { ...state },
        ])
      ) as Record<string, ManagedDevServiceState>,
    };
  }

  async applyServiceSet(serviceIds: Iterable<string>): Promise<void> {
    const normalizedServiceIds = this.#manifest.serviceIdsInOrder.filter(
      (serviceId) => new Set(serviceIds).has(serviceId)
    );
    const previousServiceIds = this.#managedServiceIds;

    this.#managedServiceIds = normalizedServiceIds;
    this.#emitChange();

    const removedServiceIds = previousServiceIds.filter((serviceId) => {
      return !normalizedServiceIds.includes(serviceId);
    });
    const addedServiceIds = normalizedServiceIds.filter((serviceId) => {
      return !previousServiceIds.includes(serviceId);
    });

    await Promise.all(
      removedServiceIds.map(async (serviceId) => this.stopService(serviceId))
    );
    await Promise.all(
      addedServiceIds.map(async (serviceId) => this.startService(serviceId))
    );
  }

  async startService(serviceId: string): Promise<void> {
    await this.#runServiceOperation(serviceId, async () => {
      this.#ensureManagedService(serviceId);
      await this.#startServiceInternal(serviceId, 'started');
    });
  }

  async stopService(serviceId: string): Promise<void> {
    await this.#runServiceOperation(serviceId, async () => {
      await this.#stopServiceInternal(serviceId);
    });
  }

  async restartService(serviceId: string): Promise<void> {
    await this.#runServiceOperation(serviceId, async () => {
      this.#ensureManagedService(serviceId);
      await this.#stopServiceInternal(serviceId);
      await this.#startServiceInternal(serviceId, 'restarted');
    });
  }

  async stopAll(): Promise<void> {
    await Promise.all(
      this.#managedServiceIds.map(async (serviceId) =>
        this.stopService(serviceId)
      )
    );
  }

  waitUntilIdle(): Promise<void> {
    if (this.#isIdle()) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const unsubscribe = this.subscribe(() => {
        if (!this.#isIdle()) {
          return;
        }

        unsubscribe();
        resolve();
      });
    });
  }

  async #runServiceOperation(
    serviceId: string,
    operation: () => Promise<void>
  ): Promise<void> {
    const previousOperation =
      this.#operations.get(serviceId) ?? Promise.resolve();
    const nextOperation = previousOperation
      .catch(() => undefined)
      .then(operation)
      .finally(() => {
        if (this.#operations.get(serviceId) === nextOperation) {
          this.#operations.delete(serviceId);
        }
      });

    this.#operations.set(serviceId, nextOperation);
    await nextOperation;
  }

  #ensureManagedService(serviceId: string): void {
    if (this.#managedServiceIds.includes(serviceId)) {
      return;
    }

    const managedServiceIds = new Set([...this.#managedServiceIds, serviceId]);
    this.#managedServiceIds = this.#manifest.serviceIdsInOrder.filter(
      (candidateServiceId) => managedServiceIds.has(candidateServiceId)
    );
    this.#emitChange();
  }

  async #startServiceInternal(
    serviceId: string,
    lifecycleMarker: 'restarted' | 'started'
  ): Promise<void> {
    const activeChildState = this.#childStates.get(serviceId);
    if (activeChildState) {
      if (this.#serviceStates[serviceId]?.status === 'stopping') {
        await activeChildState.exitPromise;
      } else {
        return;
      }
    }

    const previousState = this.#serviceStates[serviceId];
    const nextRunId = previousState.runId + 1;
    const spawnSpec = buildDevLauncherSpawnSpec(
      this.#manifest,
      serviceId,
      this.#runtime.platform
    );

    this.#setServiceState(serviceId, {
      exitCode: null,
      exitSignal: null,
      lastStartedAt: this.#runtime.now(),
      pid: null,
      runId: nextRunId,
      status: 'starting',
    });

    let resolveExit: () => void = () => undefined;
    const exitPromise = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });

    const child = this.#runtime.spawn(spawnSpec.command, spawnSpec.args, {
      cwd: spawnSpec.cwd,
      env: this.#runtime.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const childState: RunningChildState = {
      child,
      exitPromise,
      resolveExit,
      runId: nextRunId,
      stopRequested: false,
      stopTimeout: null,
      streamRemainders: {
        stderr: '',
        stdout: '',
      },
    };

    this.#childStates.set(serviceId, childState);
    this.#attachStream(serviceId, childState, 'stdout');
    this.#attachStream(serviceId, childState, 'stderr');

    child.on('error', (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.#pushLifecycleLog(
        serviceId,
        nextRunId,
        `failed to spawn: ${message}`
      );
      this.#handleChildExit(serviceId, childState, 1, null);
    });

    child.on('exit', (code: unknown, signal: unknown) => {
      this.#handleChildExit(
        serviceId,
        childState,
        typeof code === 'number' ? code : null,
        typeof signal === 'string' ? (signal as NodeJS.Signals) : null
      );
    });

    this.#setServiceState(serviceId, {
      pid: child.pid ?? null,
      status: 'running',
    });
    this.#pushLifecycleLog(serviceId, nextRunId, lifecycleMarker);
  }

  async #stopServiceInternal(serviceId: string): Promise<void> {
    const childState = this.#childStates.get(serviceId);
    if (!childState) {
      const currentState = this.#serviceStates[serviceId];
      if (
        currentState &&
        currentState.status !== 'stopped' &&
        currentState.status !== 'idle'
      ) {
        this.#setServiceState(serviceId, {
          lastStoppedAt: this.#runtime.now(),
          pid: null,
          status: 'stopped',
        });
      }
      return;
    }

    if (childState.stopRequested) {
      await childState.exitPromise;
      return;
    }

    childState.stopRequested = true;
    this.#setServiceState(serviceId, { status: 'stopping' });
    this.#pushLifecycleLog(serviceId, childState.runId, 'stopping');

    childState.child.kill('SIGTERM');
    childState.stopTimeout = this.#runtime.setTimeout(() => {
      this.#pushLifecycleLog(serviceId, childState.runId, 'force-killed');
      childState.child.kill('SIGKILL');
    }, STOP_TIMEOUT_MS);

    await childState.exitPromise;
  }

  #handleChildExit(
    serviceId: string,
    childState: RunningChildState,
    code: number | null,
    signal: NodeJS.Signals | null
  ): void {
    const activeChildState = this.#childStates.get(serviceId);
    if (activeChildState !== childState) {
      return;
    }

    this.#flushStreamRemainder(serviceId, childState, 'stdout');
    this.#flushStreamRemainder(serviceId, childState, 'stderr');

    if (childState.stopTimeout) {
      this.#runtime.clearTimeout(childState.stopTimeout);
    }

    this.#childStates.delete(serviceId);

    if (childState.stopRequested) {
      this.#setServiceState(serviceId, {
        exitCode: code,
        exitSignal: signal,
        lastStoppedAt: this.#runtime.now(),
        pid: null,
        status: 'stopped',
      });
      this.#pushLifecycleLog(serviceId, childState.runId, 'stopped');
      childState.resolveExit();
      return;
    }

    this.#setServiceState(serviceId, {
      exitCode: code,
      exitSignal: signal,
      lastStoppedAt: this.#runtime.now(),
      pid: null,
      status: 'failed',
    });

    let exitDetail = 'unknown reason';
    if (signal) {
      exitDetail = `signal ${signal}`;
    } else if (typeof code === 'number') {
      exitDetail = `code ${code}`;
    }
    this.#pushLifecycleLog(
      serviceId,
      childState.runId,
      `failed (${exitDetail})`
    );
    childState.resolveExit();
  }

  #attachStream(
    serviceId: string,
    childState: RunningChildState,
    stream: 'stderr' | 'stdout'
  ): void {
    const readable = childState.child[stream];
    if (!readable) {
      return;
    }

    readable.on('data', (chunk: Buffer | string) => {
      this.#handleStreamChunk(serviceId, childState, stream, chunk);
    });
  }

  #handleStreamChunk(
    serviceId: string,
    childState: RunningChildState,
    stream: 'stderr' | 'stdout',
    chunk: Buffer | string
  ): void {
    const chunkText = `${childState.streamRemainders[stream]}${chunk.toString()}`;
    const lines = chunkText.split(LINE_SPLIT_REGEX);
    const remainder = lines.pop() ?? '';

    childState.streamRemainders[stream] = remainder;

    for (const line of lines) {
      if (line.length === 0) {
        continue;
      }

      this.#pushLog(serviceId, childState.runId, stream, line);
    }
  }

  #flushStreamRemainder(
    serviceId: string,
    childState: RunningChildState,
    stream: 'stderr' | 'stdout'
  ): void {
    const remainder = childState.streamRemainders[stream].trim();
    if (!remainder) {
      return;
    }

    childState.streamRemainders[stream] = '';
    this.#pushLog(serviceId, childState.runId, stream, remainder);
  }

  #pushLifecycleLog(serviceId: string, runId: number, line: string): void {
    this.#pushLog(serviceId, runId, 'system', line);
  }

  #pushLog(
    serviceId: string,
    runId: number,
    stream: DevLauncherLogStream,
    line: string
  ): void {
    const entry: DevLauncherLogEntry = {
      line,
      runId,
      sequence: ++this.#logSequence,
      serviceId,
      stream,
      timestamp: this.#runtime.now(),
    };

    this.#logBuffers[serviceId].push(entry);
    this.#allLogs.push(entry);
    this.#emitChange();
  }

  #setServiceState(
    serviceId: string,
    partialState: Partial<ManagedDevServiceState>
  ): void {
    this.#serviceStates = {
      ...this.#serviceStates,
      [serviceId]: {
        ...this.#serviceStates[serviceId],
        ...partialState,
        lastUpdatedAt: this.#runtime.now(),
      },
    };
    this.#emitChange();
  }

  #emitChange(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }

  #isIdle(): boolean {
    return this.#managedServiceIds.every((serviceId) => {
      const status = this.#serviceStates[serviceId]?.status;
      return (
        status !== 'running' && status !== 'starting' && status !== 'stopping'
      );
    });
  }
}
