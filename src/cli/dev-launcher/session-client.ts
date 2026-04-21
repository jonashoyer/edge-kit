import net from 'node:net';
import { randomUUID } from 'node:crypto';
import {
  DEV_LAUNCHER_RPC_METHODS,
  createDevLauncherRpcRequest,
  isDevLauncherRpcResponseFailure,
  type DevLauncherRpcMethod,
  type DevLauncherRpcMethodParams,
  type DevLauncherRpcMethodResult,
} from './session-rpc';
import {
  defaultDevLauncherSessionStateRuntime,
  resolveReachableDevLauncherSession,
  type DevLauncherSessionStateRuntime,
} from './session-state';
import type { DevLauncherProcessController } from './process-manager';
import type {
  DevLauncherLogEntry,
  DevLauncherLogsReadParams,
  DevLauncherLogsReadResult,
  DevLauncherSessionGetResult,
  DevLauncherSessionMetadata,
  DevLauncherSupervisorSnapshot,
  LoadedDevLauncherManifest,
  ManagedDevServiceState,
} from './types';

interface ClientSocketLike {
  destroy: () => void;
  end: () => void;
  on: (
    event: 'data' | 'error',
    listener: (...args: any[]) => void
  ) => void;
  once: (
    event: 'connect' | 'data' | 'end' | 'error',
    listener: (...args: any[]) => void
  ) => void;
  write: (chunk: string) => boolean;
}

export interface DevLauncherSessionClientRuntime
  extends DevLauncherSessionStateRuntime {
  clearInterval: (interval: NodeJS.Timeout) => void;
  connectSocketClient: (socketPath: string) => ClientSocketLike;
  randomUUID: () => string;
  setInterval: (callback: () => void, delay: number) => NodeJS.Timeout;
  setTimeout: (callback: () => void, delay: number) => NodeJS.Timeout;
}

const defaultRuntime: DevLauncherSessionClientRuntime = {
  ...defaultDevLauncherSessionStateRuntime,
  clearInterval,
  connectSocketClient: (socketPath) => net.createConnection(socketPath),
  randomUUID: () => randomUUID(),
  setInterval,
  setTimeout,
};

const createEmptySnapshot = (
  manifest: LoadedDevLauncherManifest
): DevLauncherSupervisorSnapshot => ({
  allLogs: [],
  logsByServiceId: Object.fromEntries(
    manifest.serviceIdsInOrder.map((serviceId) => [serviceId, []])
  ) as Record<string, DevLauncherLogEntry[]>,
  managedServiceIds: [],
  serviceStates: Object.fromEntries(
    manifest.serviceIdsInOrder.map((serviceId) => [
      serviceId,
      {
        exitCode: null,
        exitSignal: null,
        lastStartedAt: null,
        lastStoppedAt: null,
        lastUpdatedAt: 0,
        pid: null,
        runId: 0,
        serviceId,
        status: 'idle',
      } satisfies ManagedDevServiceState,
    ])
  ) as Record<string, ManagedDevServiceState>,
});

export class DevLauncherSessionClientError extends Error {
  readonly details?: Record<string, unknown>;
  readonly errorCode: string;

  constructor(
    errorCode: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.details = details;
    this.errorCode = errorCode;
  }
}

export class DevLauncherSessionClient {
  readonly #manifest: LoadedDevLauncherManifest;
  readonly #runtime: DevLauncherSessionClientRuntime;
  #metadata: DevLauncherSessionMetadata | null = null;

  constructor(
    manifest: LoadedDevLauncherManifest,
    runtime: DevLauncherSessionClientRuntime = defaultRuntime,
    metadata?: DevLauncherSessionMetadata | null
  ) {
    this.#manifest = manifest;
    this.#runtime = runtime;
    this.#metadata = metadata ?? null;
  }

  async resolveSession(options?: {
    refresh?: boolean;
  }): Promise<DevLauncherSessionMetadata | null> {
    if (!options?.refresh && this.#metadata) {
      return this.#metadata;
    }

    this.#metadata = await resolveReachableDevLauncherSession(
      this.#manifest,
      this.#runtime
    );
    return this.#metadata;
  }

  async getSession(): Promise<DevLauncherSessionGetResult> {
    return await this.#request(DEV_LAUNCHER_RPC_METHODS.sessionGet, undefined);
  }

  async stopSession(): Promise<{ stopped: true }> {
    const response = await this.#request(
      DEV_LAUNCHER_RPC_METHODS.sessionStop,
      undefined
    );
    this.#metadata = null;
    return response;
  }

  async applyServiceSet(serviceIds: string[]): Promise<DevLauncherSessionGetResult> {
    return await this.#request(DEV_LAUNCHER_RPC_METHODS.servicesApplySet, {
      serviceIds,
    });
  }

  async startService(serviceId: string): Promise<DevLauncherSessionGetResult> {
    return await this.#request(DEV_LAUNCHER_RPC_METHODS.serviceStart, {
      serviceId,
    });
  }

  async stopService(serviceId: string): Promise<DevLauncherSessionGetResult> {
    return await this.#request(DEV_LAUNCHER_RPC_METHODS.serviceStop, {
      serviceId,
    });
  }

  async restartService(serviceId: string): Promise<DevLauncherSessionGetResult> {
    return await this.#request(DEV_LAUNCHER_RPC_METHODS.serviceRestart, {
      serviceId,
    });
  }

  async readLogs(
    params: DevLauncherLogsReadParams
  ): Promise<DevLauncherLogsReadResult> {
    return await this.#request(DEV_LAUNCHER_RPC_METHODS.logsRead, params);
  }

  async #request<Method extends DevLauncherRpcMethod>(
    method: Method,
    params: DevLauncherRpcMethodParams[Method]
  ): Promise<DevLauncherRpcMethodResult[Method]> {
    const metadata = await this.resolveSession();
    if (!metadata) {
      throw new DevLauncherSessionClientError(
        'no_session',
        'No dev launcher session is running for this repo.'
      );
    }

    const requestId = this.#runtime.randomUUID();
    const socket = this.#runtime.connectSocketClient(metadata.socketPath);

    const response = await new Promise<DevLauncherRpcMethodResult[Method]>(
      (resolve, reject) => {
        let bufferedData = '';
        let isSettled = false;

        const settle = (
          callback: () => void,
          shouldDestroyMetadata = false
        ): void => {
          if (isSettled) {
            return;
          }

          isSettled = true;
          if (shouldDestroyMetadata) {
            this.#metadata = null;
          }
          callback();
        };

        socket.once('connect', () => {
          const request = createDevLauncherRpcRequest(requestId, method, params);
          socket.write(`${JSON.stringify(request)}\n`);
        });

        socket.on('data', (chunk: Buffer | string) => {
          bufferedData += chunk.toString();
          const [line] = bufferedData.split('\n');

          if (!line || !bufferedData.includes('\n')) {
            return;
          }

          try {
            const parsedResponse = JSON.parse(line) as any;
            if (isDevLauncherRpcResponseFailure(parsedResponse)) {
              settle(() => {
                reject(
                  new DevLauncherSessionClientError(
                    parsedResponse.error.data?.errorCode ?? 'rpc_error',
                    parsedResponse.error.message,
                    parsedResponse.error.data?.details
                  )
                );
              });
              return;
            }

            settle(() => {
              resolve(
                parsedResponse.result as DevLauncherRpcMethodResult[Method]
              );
            });
          } catch (error) {
            settle(() => {
              reject(
                new DevLauncherSessionClientError(
                  'invalid_response',
                  error instanceof Error ? error.message : String(error)
                )
              );
            });
          }
        });

        socket.once('error', (error: Error) => {
          settle(
            () => {
              reject(
                new DevLauncherSessionClientError(
                  'socket_error',
                  error.message
                )
              );
            },
            true
          );
        });

        socket.once('end', () => {
          settle(
            () => {
              reject(
                new DevLauncherSessionClientError(
                  'socket_closed',
                  'Dev launcher session closed before responding.'
                )
              );
            },
            true
          );
          socket.destroy();
        });
      }
    );

    socket.end();
    return response;
  }
}

export interface DevLauncherRemoteControllerRuntime {
  clearInterval: (interval: NodeJS.Timeout) => void;
  setInterval: (callback: () => void, delay: number) => NodeJS.Timeout;
}

const defaultControllerRuntime: DevLauncherRemoteControllerRuntime = {
  clearInterval,
  setInterval,
};

export class DevLauncherRemoteProcessController
  implements DevLauncherProcessController
{
  readonly #client: DevLauncherSessionClient;
  readonly #listeners = new Set<() => void>();
  readonly #manifest: LoadedDevLauncherManifest;
  readonly #runtime: DevLauncherRemoteControllerRuntime;
  #pollInterval: NodeJS.Timeout | null = null;
  #snapshot: DevLauncherSupervisorSnapshot;

  constructor(
    manifest: LoadedDevLauncherManifest,
    client: DevLauncherSessionClient,
    initialSummary: DevLauncherSessionGetResult,
    runtime: DevLauncherRemoteControllerRuntime = defaultControllerRuntime
  ) {
    this.#manifest = manifest;
    this.#client = client;
    this.#runtime = runtime;
    this.#snapshot = initialSummary.session.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    this.#ensurePolling();
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0 && this.#pollInterval) {
        this.#runtime.clearInterval(this.#pollInterval);
        this.#pollInterval = null;
      }
    };
  }

  getSnapshot(): DevLauncherSupervisorSnapshot {
    return {
      allLogs: [...this.#snapshot.allLogs],
      logsByServiceId: Object.fromEntries(
        Object.entries(this.#snapshot.logsByServiceId).map(([serviceId, entries]) => [
          serviceId,
          [...entries],
        ])
      ) as Record<string, DevLauncherLogEntry[]>,
      managedServiceIds: [...this.#snapshot.managedServiceIds],
      serviceStates: Object.fromEntries(
        Object.entries(this.#snapshot.serviceStates).map(([serviceId, state]) => [
          serviceId,
          { ...state },
        ])
      ) as Record<string, ManagedDevServiceState>,
    };
  }

  async applyServiceSet(serviceIds: Iterable<string>): Promise<void> {
    const summary = await this.#client.applyServiceSet([...serviceIds]);
    this.#setSnapshot(summary.session.snapshot);
  }

  async startService(serviceId: string): Promise<void> {
    const summary = await this.#client.startService(serviceId);
    this.#setSnapshot(summary.session.snapshot);
  }

  async stopService(serviceId: string): Promise<void> {
    const summary = await this.#client.stopService(serviceId);
    this.#setSnapshot(summary.session.snapshot);
  }

  async restartService(serviceId: string): Promise<void> {
    const summary = await this.#client.restartService(serviceId);
    this.#setSnapshot(summary.session.snapshot);
  }

  async stopAll(): Promise<void> {
    const summary = await this.#client.applyServiceSet([]);
    this.#setSnapshot(summary.session.snapshot);
  }

  async waitUntilIdle(): Promise<void> {
    while (
      Object.values(this.#snapshot.serviceStates).some((state) => {
        return state.status === 'starting' || state.status === 'stopping';
      })
    ) {
      await this.#refreshSnapshot();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });
    }
  }

  async #refreshSnapshot(): Promise<void> {
    try {
      const summary = await this.#client.getSession();
      this.#setSnapshot(summary.session.snapshot);
    } catch (error) {
      if (
        error instanceof DevLauncherSessionClientError &&
        error.errorCode === 'no_session'
      ) {
        this.#setSnapshot(createEmptySnapshot(this.#manifest));
        return;
      }

      throw error;
    }
  }

  #ensurePolling(): void {
    if (this.#pollInterval) {
      return;
    }

    this.#pollInterval = this.#runtime.setInterval(() => {
      this.#refreshSnapshot().catch(() => undefined);
    }, 250);
  }

  #setSnapshot(snapshot: DevLauncherSupervisorSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
