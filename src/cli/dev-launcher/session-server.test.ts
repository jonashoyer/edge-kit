import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DevLauncherProcessController } from './process-manager';
import { DevLauncherSessionClient } from './session-client';
import { DevLauncherSessionServer } from './session-server';
import type {
  DevLauncherLogEntry,
  DevLauncherSupervisorSnapshot,
  LoadedDevLauncherManifest,
  ManagedDevServiceState,
} from './types';

const tempDirectories: string[] = [];

const createManifest = (repoRoot: string): LoadedDevLauncherManifest => ({
  actionIdsInOrder: [],
  actionsById: {},
  configPath: `${repoRoot}/dev-cli.config.ts`,
  packageManager: 'pnpm',
  repoRoot,
  serviceIdsInOrder: ['app'],
  servicesById: {
    app: {
      label: 'App',
      target: {
        kind: 'root-script',
        script: 'dev',
      },
    },
  },
  version: 1,
});

const createServiceState = (
  overrides?: Partial<ManagedDevServiceState>
): ManagedDevServiceState => ({
  exitCode: null,
  exitSignal: null,
  lastStartedAt: null,
  lastStoppedAt: null,
  lastUpdatedAt: 1,
  pid: null,
  runId: 0,
  serviceId: 'app',
  status: 'idle',
  ...overrides,
});

class FakeController implements DevLauncherProcessController {
  readonly applyServiceSet = vi.fn(async (serviceIds: Iterable<string>) => {
    this.snapshot.managedServiceIds = [...serviceIds];
    this.snapshot.serviceStates.app = createServiceState({
      status: this.snapshot.managedServiceIds.length > 0 ? 'running' : 'stopped',
    });
  });
  readonly restartService = vi.fn(async (_serviceId: string) => {
    this.snapshot.serviceStates.app = createServiceState({
      runId: this.snapshot.serviceStates.app.runId + 1,
      status: 'running',
    });
  });
  readonly startService = vi.fn(async (serviceId: string) => {
    this.snapshot.managedServiceIds = [serviceId];
    this.snapshot.serviceStates.app = createServiceState({
      status: 'running',
    });
  });
  readonly stopAll = vi.fn(async () => {
    this.snapshot.managedServiceIds = [];
    this.snapshot.serviceStates.app = createServiceState({
      status: 'stopped',
    });
  });
  readonly stopService = vi.fn(async () => {
    this.snapshot.managedServiceIds = [];
    this.snapshot.serviceStates.app = createServiceState({
      status: 'stopped',
    });
  });
  snapshot: DevLauncherSupervisorSnapshot = {
    allLogs: [
      {
        line: 'one',
        runId: 1,
        sequence: 1,
        serviceId: 'app',
        stream: 'stdout',
        timestamp: 1,
      },
      {
        line: 'two',
        runId: 1,
        sequence: 2,
        serviceId: 'app',
        stream: 'stdout',
        timestamp: 2,
      },
      {
        line: 'three',
        runId: 1,
        sequence: 3,
        serviceId: 'app',
        stream: 'stdout',
        timestamp: 3,
      },
    ] as DevLauncherLogEntry[],
    logsByServiceId: {
      app: [],
    },
    managedServiceIds: [],
    serviceStates: {
      app: createServiceState(),
    },
  };
  readonly subscribe = vi.fn(() => () => undefined);
  readonly waitUntilIdle = vi.fn(async () => undefined);

  constructor() {
    this.snapshot.logsByServiceId.app = [...this.snapshot.allLogs];
  }

  getSnapshot(): DevLauncherSupervisorSnapshot {
    return {
      allLogs: [...this.snapshot.allLogs],
      logsByServiceId: {
        app: [...this.snapshot.logsByServiceId.app],
      },
      managedServiceIds: [...this.snapshot.managedServiceIds],
      serviceStates: {
        app: { ...this.snapshot.serviceStates.app },
      },
    };
  }
}

class FakeSocket {
  peer: FakeSocket | null = null;
  readonly persistentListeners = new Map<string, Array<(...args: any[]) => void>>();
  readonly onceListeners = new Map<string, Array<(...args: any[]) => void>>();

  destroy(): void {
    this.emit('close');
  }

  emit(event: string, ...args: any[]): void {
    const onceListeners = this.onceListeners.get(event) ?? [];
    this.onceListeners.delete(event);
    for (const listener of onceListeners) {
      listener(...args);
    }

    for (const listener of this.persistentListeners.get(event) ?? []) {
      listener(...args);
    }
  }

  end(): void {
    this.emit('end');
    this.peer?.emit('end');
  }

  on(event: string, listener: (...args: any[]) => void): void {
    const currentListeners = this.persistentListeners.get(event) ?? [];
    currentListeners.push(listener);
    this.persistentListeners.set(event, currentListeners);
  }

  once(event: string, listener: (...args: any[]) => void): void {
    const currentListeners = this.onceListeners.get(event) ?? [];
    currentListeners.push(listener);
    this.onceListeners.set(event, currentListeners);
  }

  removeAllListeners(): void {
    this.onceListeners.clear();
    this.persistentListeners.clear();
  }

  write(chunk: string): boolean {
    this.peer?.emit('data', chunk);
    return true;
  }
}

const createTransportRegistry = () => {
  const listeners = new Map<string, (socket: FakeSocket) => void>();

  return {
    connect(socketPath: string): FakeSocket {
      const listener = listeners.get(socketPath);
      const clientSocket = new FakeSocket();

      if (!listener) {
        queueMicrotask(() => {
          clientSocket.emit('error', new Error('missing listener'));
        });
        return clientSocket;
      }

      const serverSocket = new FakeSocket();
      clientSocket.peer = serverSocket;
      serverSocket.peer = clientSocket;
      listener(serverSocket);
      queueMicrotask(() => {
        clientSocket.emit('connect');
      });
      return clientSocket;
    },
    has(socketPath: string): boolean {
      return listeners.has(socketPath);
    },
    listen(socketPath: string, listener: (socket: FakeSocket) => void): void {
      listeners.set(socketPath, listener);
    },
    remove(socketPath: string): void {
      listeners.delete(socketPath);
    },
  };
};

const createStateRuntime = (
  stateRoot: string,
  transportRegistry = createTransportRegistry()
) => {
  const serverState = {
    socketPath: '',
  };

  return {
    clearInterval,
    connectSocket: async (socketPath: string) => transportRegistry.has(socketPath),
    connectSocketClient: (socketPath: string) =>
      transportRegistry.connect(socketPath),
    createController: vi.fn(),
    createServer: (listener: (socket: FakeSocket) => void) => {
      return {
        close: (callback?: (error?: Error | undefined) => void) => {
          if (serverState.socketPath) {
            transportRegistry.remove(serverState.socketPath);
          }
          callback?.();
        },
        listen: (socketPath: string, listeningListener?: () => void) => {
          serverState.socketPath = socketPath;
          transportRegistry.listen(socketPath, listener);
          listeningListener?.();
        },
        on: () => {
          return undefined;
        },
      };
    },
    env: {
      EDGE_KIT_DEV_LAUNCHER_STATE_DIR: stateRoot,
    },
    existsSync: fs.existsSync,
    homedir: () => os.homedir(),
    kill: (pid: number, signal: NodeJS.Signals | number) =>
      process.kill(pid, signal),
    mkdirSync: fs.mkdirSync,
    now: () => 1,
    platform: 'darwin' as const,
    processId: process.pid,
    randomUUID: () => 'session-1',
    readFileSync: fs.readFileSync,
    setInterval,
    setTimeout,
    statSync: fs.statSync,
    unlinkSync: fs.unlinkSync,
    writeFileSync: fs.writeFileSync,
  };
};

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

describe('session-server', () => {
  it('serves session.get and logs.read over the Unix socket', async () => {
    const stateRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'edge-kit-session-server-')
    );
    tempDirectories.push(stateRoot);
    const manifest = createManifest('/repo-session-server-one');
    const controller = new FakeController();
    const runtime = createStateRuntime(stateRoot);
    runtime.createController.mockReturnValue(controller);
    const server = new DevLauncherSessionServer(
      manifest,
      'foreground',
      runtime as never
    );

    const metadata = await server.start();
    const client = new DevLauncherSessionClient(
      manifest,
      runtime as never,
      metadata
    );

    const summary = await client.getSession();
    const logs = await client.readLogs({
      afterSequence: 1,
      limit: 1,
      serviceId: 'app',
    });

    expect(summary.session.metadata.sessionId).toBe('session-1');
    expect(logs.entries.map((entry) => entry.line)).toEqual(['three']);

    await client.stopSession();
    await server.waitUntilStopped();
  });

  it('dispatches service lifecycle RPC methods through the controller', async () => {
    const stateRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'edge-kit-session-server-')
    );
    tempDirectories.push(stateRoot);
    const manifest = createManifest('/repo-session-server-two');
    const controller = new FakeController();
    const runtime = createStateRuntime(stateRoot);
    runtime.createController.mockReturnValue(controller);
    const server = new DevLauncherSessionServer(
      manifest,
      'headless',
      runtime as never
    );

    const metadata = await server.start();
    const client = new DevLauncherSessionClient(
      manifest,
      runtime as never,
      metadata
    );

    await client.applyServiceSet(['app']);
    await client.restartService('app');
    await client.stopService('app');

    expect(controller.applyServiceSet).toHaveBeenCalledWith(['app']);
    expect(controller.restartService).toHaveBeenCalledWith('app');
    expect(controller.stopService).toHaveBeenCalledWith('app');

    await client.stopSession();
    await server.waitUntilStopped();
  });
});
