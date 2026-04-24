import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { normalizeSelectedServiceIds } from './manifest';
import type { DevLauncherProcessController } from './process-manager';
import { DevLauncherProcessManager } from './process-manager';
import {
  DEV_LAUNCHER_RPC_METHODS,
  DEV_LAUNCHER_RPC_VERSION,
} from './session-rpc';
import {
  cleanupDevLauncherSessionArtifacts,
  type DevLauncherSessionStateRuntime,
  defaultDevLauncherSessionStateRuntime,
  resolveDevLauncherSocketPath,
  writeDevLauncherSessionMetadata,
} from './session-state';
import type {
  DevLauncherLogEntry,
  DevLauncherLogsReadParams,
  DevLauncherRpcFailure,
  DevLauncherRpcRequest,
  DevLauncherRpcResponse,
  DevLauncherRpcSuccess,
  DevLauncherServiceActionParams,
  DevLauncherServicesApplySetParams,
  DevLauncherSessionGetResult,
  DevLauncherSessionMetadata,
  LoadedDevLauncherManifest,
} from './types';

interface SocketLike {
  destroy: () => void;
  on: (
    event: 'close' | 'data' | 'error',
    listener: (...args: any[]) => void
  ) => void;
  write: (chunk: string) => boolean;
}

interface ServerLike {
  close: (callback?: (error?: Error | undefined) => void) => void;
  listen: (path: string, listeningListener?: () => void) => void;
  on: (
    event: 'connection' | 'error',
    listener: (...args: any[]) => void
  ) => void;
}

export interface DevLauncherSessionServerRuntime
  extends DevLauncherSessionStateRuntime {
  createController: (
    manifest: LoadedDevLauncherManifest
  ) => DevLauncherProcessController;
  createServer: (listener: (socket: SocketLike) => void) => ServerLike;
  now: () => number;
  randomUUID: () => string;
}

const createSuccessResponse = <Result>(
  id: string | number | null,
  result: Result
): DevLauncherRpcSuccess<Result> => ({
  id,
  jsonrpc: DEV_LAUNCHER_RPC_VERSION,
  result,
});

const createFailureResponse = (
  id: string | number | null,
  options: {
    code: number;
    details?: Record<string, unknown>;
    errorCode?: string;
    message: string;
  }
): DevLauncherRpcFailure => ({
  error: {
    code: options.code,
    data:
      options.errorCode || options.details
        ? {
            details: options.details,
            errorCode: options.errorCode,
          }
        : undefined,
    message: options.message,
  },
  id,
  jsonrpc: DEV_LAUNCHER_RPC_VERSION,
});

const defaultRuntime: DevLauncherSessionServerRuntime = {
  ...defaultDevLauncherSessionStateRuntime,
  createController: (manifest) => new DevLauncherProcessManager(manifest),
  createServer: (listener) => net.createServer(listener),
  now: () => Date.now(),
  randomUUID: () => randomUUID(),
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isRpcRequest = (value: unknown): value is DevLauncherRpcRequest => {
  return (
    isRecord(value) &&
    value.jsonrpc === DEV_LAUNCHER_RPC_VERSION &&
    typeof value.method === 'string' &&
    ('id' in value
      ? value.id === null ||
        typeof value.id === 'number' ||
        typeof value.id === 'string'
      : true)
  );
};

const clampLogLimit = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 200;
  }

  return Math.max(1, Math.min(Math.trunc(value), 1000));
};

const getLogsReadResult = (
  entries: DevLauncherLogEntry[],
  params: DevLauncherLogsReadParams
) => {
  const afterSequence = Math.max(0, Math.trunc(params.afterSequence ?? 0));
  const filteredEntries = entries.filter(
    (entry) => entry.sequence > afterSequence
  );
  const limitedEntries = filteredEntries.slice(-clampLogLimit(params.limit));
  const highestSequence =
    limitedEntries.at(-1)?.sequence ??
    entries.at(-1)?.sequence ??
    afterSequence;

  return {
    entries: limitedEntries,
    highestSequence,
  };
};

const assertKnownServiceId = (
  manifest: LoadedDevLauncherManifest,
  serviceId: string
): void => {
  if (manifest.servicesById[serviceId]) {
    return;
  }

  throw new Error(`Unknown dev service "${serviceId}".`);
};

const createSessionSummary = (
  metadata: DevLauncherSessionMetadata,
  controller: DevLauncherProcessController
): DevLauncherSessionGetResult => ({
  session: {
    metadata,
    snapshot: controller.getSnapshot(),
  },
});

export class DevLauncherSessionServer {
  readonly #controller: DevLauncherProcessController;
  readonly #manifest: LoadedDevLauncherManifest;
  readonly #mode: DevLauncherSessionMetadata['mode'];
  readonly #runtime: DevLauncherSessionServerRuntime;
  readonly #server: ServerLike;
  #metadata: DevLauncherSessionMetadata | null = null;
  #resolveStopped: (() => void) | null = null;
  #started = false;
  #stoppedPromise: Promise<void>;
  #stopPromise: Promise<void> | null = null;

  constructor(
    manifest: LoadedDevLauncherManifest,
    mode: DevLauncherSessionMetadata['mode'],
    runtime: DevLauncherSessionServerRuntime = defaultRuntime
  ) {
    this.#manifest = manifest;
    this.#mode = mode;
    this.#runtime = runtime;
    this.#controller = runtime.createController(manifest);
    this.#server = runtime.createServer((socket) => {
      this.#handleSocketConnection(socket);
    });
    this.#stoppedPromise = new Promise<void>((resolve) => {
      this.#resolveStopped = resolve;
    });
  }

  getController(): DevLauncherProcessController {
    return this.#controller;
  }

  getMetadata(): DevLauncherSessionMetadata {
    if (!this.#metadata) {
      throw new Error('Dev launcher session host has not started yet.');
    }

    return this.#metadata;
  }

  async start(
    initialServiceIds?: string[]
  ): Promise<DevLauncherSessionMetadata> {
    if (this.#started) {
      return this.getMetadata();
    }

    cleanupDevLauncherSessionArtifacts(this.#manifest, this.#runtime);

    const socketPath = resolveDevLauncherSocketPath(this.#manifest);
    await new Promise<void>((resolve, reject) => {
      this.#server.on('error', reject);
      this.#server.listen(socketPath, () => {
        resolve();
      });
    });

    const metadata: DevLauncherSessionMetadata = {
      mode: this.#mode,
      pid: this.#runtime.processId,
      repoRoot: this.#manifest.repoRoot,
      sessionId: this.#runtime.randomUUID(),
      socketPath,
      startedAt: this.#runtime.now(),
      version: 1,
    };

    writeDevLauncherSessionMetadata(this.#manifest, metadata, this.#runtime);
    this.#metadata = metadata;
    this.#started = true;

    if (initialServiceIds && initialServiceIds.length > 0) {
      try {
        await this.#controller.applyServiceSet(
          normalizeSelectedServiceIds(this.#manifest, initialServiceIds)
        );
      } catch (error) {
        await this.stop();
        throw error;
      }
    }

    return metadata;
  }

  async stop(): Promise<void> {
    if (this.#stopPromise) {
      return await this.#stopPromise;
    }

    this.#stopPromise = (async () => {
      try {
        await this.#controller.stopAll();
      } finally {
        await new Promise<void>((resolve) => {
          this.#server.close(() => {
            resolve();
          });
        });
        cleanupDevLauncherSessionArtifacts(this.#manifest, this.#runtime);
        this.#resolveStopped?.();
      }
    })();

    return await this.#stopPromise;
  }

  async waitUntilStopped(): Promise<void> {
    return await this.#stoppedPromise;
  }

  async #handleRpcRequest(
    request: DevLauncherRpcRequest
  ): Promise<DevLauncherRpcResponse<unknown>> {
    if (!isRpcRequest(request)) {
      return createFailureResponse(null, {
        code: -32_600,
        errorCode: 'invalid_request',
        message: 'Invalid JSON-RPC request.',
      });
    }

    const metadata = this.getMetadata();

    try {
      switch (request.method) {
        case DEV_LAUNCHER_RPC_METHODS.sessionGet:
          return createSuccessResponse(
            request.id,
            createSessionSummary(metadata, this.#controller)
          );
        case DEV_LAUNCHER_RPC_METHODS.sessionStop:
          queueMicrotask(() => {
            void this.stop();
          });
          return createSuccessResponse(request.id, { stopped: true });
        case DEV_LAUNCHER_RPC_METHODS.servicesApplySet: {
          const params = (request.params ??
            {}) as DevLauncherServicesApplySetParams;
          if (!Array.isArray(params.serviceIds)) {
            throw new Error('services.applySet requires serviceIds.');
          }

          await this.#controller.applyServiceSet(
            normalizeSelectedServiceIds(this.#manifest, params.serviceIds)
          );
          return createSuccessResponse(
            request.id,
            createSessionSummary(metadata, this.#controller)
          );
        }
        case DEV_LAUNCHER_RPC_METHODS.serviceStart: {
          const params = (request.params ??
            {}) as DevLauncherServiceActionParams;
          if (typeof params.serviceId !== 'string') {
            throw new Error('service.start requires serviceId.');
          }

          assertKnownServiceId(this.#manifest, params.serviceId);
          await this.#controller.startService(params.serviceId);
          return createSuccessResponse(
            request.id,
            createSessionSummary(metadata, this.#controller)
          );
        }
        case DEV_LAUNCHER_RPC_METHODS.serviceStop: {
          const params = (request.params ??
            {}) as DevLauncherServiceActionParams;
          if (typeof params.serviceId !== 'string') {
            throw new Error('service.stop requires serviceId.');
          }

          assertKnownServiceId(this.#manifest, params.serviceId);
          await this.#controller.stopService(params.serviceId);
          return createSuccessResponse(
            request.id,
            createSessionSummary(metadata, this.#controller)
          );
        }
        case DEV_LAUNCHER_RPC_METHODS.serviceRestart: {
          const params = (request.params ??
            {}) as DevLauncherServiceActionParams;
          if (typeof params.serviceId !== 'string') {
            throw new Error('service.restart requires serviceId.');
          }

          assertKnownServiceId(this.#manifest, params.serviceId);
          await this.#controller.restartService(params.serviceId);
          return createSuccessResponse(
            request.id,
            createSessionSummary(metadata, this.#controller)
          );
        }
        case DEV_LAUNCHER_RPC_METHODS.logsRead: {
          const params = (request.params ?? {}) as DevLauncherLogsReadParams;
          if (
            params.serviceId !== undefined &&
            typeof params.serviceId !== 'string'
          ) {
            throw new Error(
              'logs.read serviceId must be a string when provided.'
            );
          }

          if (params.serviceId) {
            assertKnownServiceId(this.#manifest, params.serviceId);
          }

          const snapshot = this.#controller.getSnapshot();
          const sourceEntries = params.serviceId
            ? (snapshot.logsByServiceId[params.serviceId] ?? [])
            : snapshot.allLogs;
          return createSuccessResponse(
            request.id,
            getLogsReadResult(sourceEntries, params)
          );
        }
        default:
          return createFailureResponse(request.id, {
            code: -32_601,
            errorCode: 'method_not_found',
            message: `Unknown JSON-RPC method "${request.method}".`,
          });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createFailureResponse(request.id, {
        code: -32_602,
        errorCode: 'invalid_params',
        message,
      });
    }
  }

  #handleSocketConnection(socket: SocketLike): void {
    let bufferedData = '';

    socket.on('data', (chunk: Buffer | string) => {
      bufferedData += chunk.toString();
      const lines = bufferedData.split('\n');
      bufferedData = lines.pop() ?? '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.length === 0) {
          continue;
        }

        let payload: unknown;
        try {
          payload = JSON.parse(trimmedLine);
        } catch {
          const response = createFailureResponse(null, {
            code: -32_700,
            errorCode: 'parse_error',
            message: 'Invalid JSON payload.',
          });
          socket.write(`${JSON.stringify(response)}\n`);
          continue;
        }

        this.#handleRpcRequest(payload as DevLauncherRpcRequest)
          .then((response) => {
            socket.write(`${JSON.stringify(response)}\n`);
          })
          .catch((error) => {
            const message =
              error instanceof Error ? error.message : String(error);
            socket.write(
              `${JSON.stringify(
                createFailureResponse(null, {
                  code: -32_603,
                  errorCode: 'internal_error',
                  message,
                })
              )}\n`
            );
          });
      }
    });

    socket.on('error', () => {
      socket.destroy();
    });

    socket.on('close', () => {
      bufferedData = '';
    });
  }
}
