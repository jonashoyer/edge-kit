/** biome-ignore-all lint/suspicious/noConsole: CLI command output is intentional. */
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import prompts from 'prompts';
import type { DevActionSuggestion } from './action-runner';
import {
  getDevPreflightActionSuggestions,
  listDevActions,
  runDevAction,
} from './action-runner';
import { loadDevLauncherConfig } from './config';
import { normalizeSelectedServiceIds } from './manifest';
import { openExternalUrl } from './open-url';
import {
  DevLauncherCommandError,
  formatDevLauncherStructuredOutput,
  resolveDevLauncherCommandOutputFormat,
} from './output-format';
import {
  runPlainDevSession,
  type PlainDevSessionOptions,
  type PlainDevSessionRuntime,
} from './plain-runner';
import {
  bootstrapDevLauncherSessionInTerminal,
  type DevLauncherBootstrapRuntime,
} from './session-bootstrap';
import {
  DevLauncherRemoteProcessController,
  DevLauncherSessionClient,
  DevLauncherSessionClientError,
  type DevLauncherSessionClientRuntime,
} from './session-client';
import { DevLauncherSessionServer } from './session-server';
import type { DevLauncherSessionStateRuntime } from './session-state';
import { startDevLauncherTuiSession } from './tui';
import type {
  DevLauncherCommandOutputFormat,
  DevLauncherLogEntry,
  DevLauncherSessionGetResult,
  DevLauncherSessionMetadata,
  LoadedDevLauncherManifest,
} from './types';

export interface DevLauncherCommandOptions {
  config?: string;
  noTui?: boolean;
  services?: string;
}

export interface DevLauncherStructuredOutputCommandOptions {
  json?: boolean;
  toon?: boolean;
}

export interface DevLauncherLogsCommandOptions
  extends DevLauncherStructuredOutputCommandOptions {
  after?: string;
  config?: string;
  follow?: boolean;
  limit?: string;
}

export interface DevLauncherServicesApplyCommandOptions
  extends DevLauncherStructuredOutputCommandOptions {
  config?: string;
  services: string;
}

export interface DevLauncherStatusCommandOptions
  extends DevLauncherStructuredOutputCommandOptions {
  config?: string;
}

export interface DevLauncherSessionHostCommandOptions {
  config?: string;
  headless?: boolean;
  services?: string;
}

export interface DevLauncherCommandRuntime {
  bootstrapSession: (
    manifest: LoadedDevLauncherManifest
  ) => Promise<DevLauncherSessionMetadata>;
  clientRuntime: DevLauncherSessionClientRuntime;
  createRemoteController: (
    manifest: LoadedDevLauncherManifest,
    client: DevLauncherSessionClient,
    initialSummary: DevLauncherSessionGetResult
  ) => DevLauncherRemoteProcessController;
  createSessionClient: (
    manifest: LoadedDevLauncherManifest,
    metadata?: DevLauncherSessionMetadata | null
  ) => DevLauncherSessionClient;
  createSessionServer: (
    manifest: LoadedDevLauncherManifest,
    mode: 'foreground' | 'headless'
  ) => DevLauncherSessionServer;
  getPreflightSuggestions: (
    manifest: LoadedDevLauncherManifest,
    actionsConfig: LoadedDevLauncherManifest
  ) => Promise<DevActionSuggestion[]>;
  isInteractiveTuiSupported: () => boolean;
  loadManifest: (options?: {
    configPath?: string;
    cwd?: string;
  }) => Promise<LoadedDevLauncherManifest>;
  runPlainSession: (
    manifest: LoadedDevLauncherManifest,
    controller: DevLauncherRemoteProcessController,
    initialServiceIds?: string[],
    options?: PlainDevSessionOptions
  ) => Promise<number>;
  sessionStateRuntime: DevLauncherSessionStateRuntime;
  startTuiSession: (
    manifest: LoadedDevLauncherManifest,
    controller: DevLauncherRemoteProcessController,
    initialServiceIds?: string[],
    options?: {
      allowStartupSelection?: boolean;
      onRequestExit?: (options: {
        hasFailure: boolean;
      }) => Promise<void>;
    }
  ) => Promise<number>;
  stderr: Pick<NodeJS.WriteStream, 'write'>;
  stdout: Pick<NodeJS.WriteStream, 'write'>;
}

const connectSocket = async (socketPath: string): Promise<boolean> => {
  return await new Promise((resolve) => {
    const socket = createConnection(socketPath);

    const finish = (connected: boolean): void => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(connected);
    };

    socket.once('connect', () => {
      finish(true);
    });
    socket.once('error', () => {
      finish(false);
    });
  });
};

const baseSessionStateRuntime: DevLauncherSessionStateRuntime = {
  connectSocket,
  env: process.env,
  existsSync,
  homedir,
  kill: (pid, signal) => process.kill(pid, signal),
  mkdirSync,
  platform: process.platform,
  processId: process.pid,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
};

const baseClientRuntime: DevLauncherSessionClientRuntime = {
  ...baseSessionStateRuntime,
  clearInterval,
  connectSocketClient: (socketPath) => createConnection(socketPath),
  randomUUID,
  setInterval,
  setTimeout,
};

const baseBootstrapRuntime: DevLauncherBootstrapRuntime = {
  ...baseSessionStateRuntime,
  platform: process.platform,
  setTimeout,
  spawn: (command, args, options) => spawn(command, args, options),
};

const defaultRuntime: DevLauncherCommandRuntime = {
  bootstrapSession: async (manifest) => {
    return await bootstrapDevLauncherSessionInTerminal(
      manifest,
      baseBootstrapRuntime
    );
  },
  clientRuntime: baseClientRuntime,
  createRemoteController: (manifest, client, initialSummary) => {
    return new DevLauncherRemoteProcessController(
      manifest,
      client,
      initialSummary
    );
  },
  createSessionClient: (manifest, metadata) => {
    return new DevLauncherSessionClient(manifest, baseClientRuntime, metadata);
  },
  createSessionServer: (manifest, mode) => {
    return new DevLauncherSessionServer(manifest, mode);
  },
  getPreflightSuggestions: async (manifest, actionsConfig) => {
    return await getDevPreflightActionSuggestions(manifest, actionsConfig);
  },
  isInteractiveTuiSupported: () => {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY);
  },
  loadManifest: async (options) => await loadDevLauncherConfig(options),
  runPlainSession: async (manifest, controller, initialServiceIds, options) => {
    const plainRuntime: PlainDevSessionRuntime = {
      canPrompt: Boolean(process.stdin.isTTY),
      createController: () => controller,
      prompt: async (question) => prompts(question as never),
      stderr: process.stderr,
      stdout: process.stdout,
    };

    return await runPlainDevSession(
      manifest,
      plainRuntime,
      initialServiceIds,
      options
    );
  },
  sessionStateRuntime: baseSessionStateRuntime,
  startTuiSession: async (manifest, controller, initialServiceIds, options) => {
    return await startDevLauncherTuiSession(
      manifest,
      {
        createController: () => controller,
        listActions: async (loadedManifest) => {
          return await listDevActions(loadedManifest, loadedManifest);
        },
        openExternalUrl: async (url) => {
          await openExternalUrl(url);
        },
        runDevAction: async (loadedManifest, actionId) => {
          return await runDevAction(loadedManifest, loadedManifest, actionId);
        },
        stderr: process.stderr,
        stdin: process.stdin,
        stdout: process.stdout,
      },
      initialServiceIds,
      {
        allowStartupSelection: options?.allowStartupSelection,
        onRequestExit: options?.onRequestExit
          ? async ({ hasFailure }) => {
              await options.onRequestExit?.({ hasFailure });
            }
          : undefined,
      }
    );
  },
  stderr: process.stderr,
  stdout: process.stdout,
};

const parseServiceIdsOption = (servicesOption: string): string[] => {
  return servicesOption
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};

const parseOptionalInteger = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue)) {
    throw new Error(`Expected an integer value, received "${value}".`);
  }

  return parsedValue;
};

const formatLogLine = (
  manifest: LoadedDevLauncherManifest,
  entry: DevLauncherLogEntry
): string => {
  const label = manifest.servicesById[entry.serviceId]?.label ?? entry.serviceId;
  return `[${label}:${entry.stream}] ${entry.line}`;
};

const writeStructuredOutput = (
  runtime: Pick<DevLauncherCommandRuntime, 'stdout'>,
  value: unknown,
  format: Exclude<DevLauncherCommandOutputFormat, 'text'>
): void => {
  runtime.stdout.write(`${formatDevLauncherStructuredOutput(value, format)}\n`);
};

const resolveCommandOutputFormat = (
  options: DevLauncherStructuredOutputCommandOptions
): DevLauncherCommandOutputFormat => {
  return resolveDevLauncherCommandOutputFormat(options);
};

const writeCommandError = (
  runtime: Pick<DevLauncherCommandRuntime, 'stderr' | 'stdout'>,
  error: unknown,
  format: DevLauncherCommandOutputFormat = 'text'
): never => {
  let errorCode = 'command_failed';
  let message = error instanceof Error ? error.message : String(error);
  let details: Record<string, unknown> | undefined;

  if (error instanceof DevLauncherSessionClientError) {
    errorCode = error.errorCode;
    details = error.details;
  } else if (error instanceof DevLauncherCommandError) {
    errorCode = error.code;
    details = error.details;
  }

  if (format === 'json' || format === 'toon') {
    writeStructuredOutput(
      runtime,
      {
        error: {
          code: errorCode,
          details,
          message,
        },
        ok: false,
      },
      format
    );
  } else {
    runtime.stderr.write(`${message}\n`);
  }

  throw error;
};

const createReadOnlyNoSessionError = (): DevLauncherSessionClientError => {
  return new DevLauncherSessionClientError(
    'no_session',
    'No dev launcher session is running for this repo.'
  );
};

const createAttachedController = async (
  manifest: LoadedDevLauncherManifest,
  runtime: DevLauncherCommandRuntime,
  metadata?: DevLauncherSessionMetadata | null
) => {
  const client = runtime.createSessionClient(manifest, metadata);
  const summary = await client.getSession();

  return {
    client,
    controller: runtime.createRemoteController(manifest, client, summary),
    summary,
  };
};

const runAttachedSessionView = async (
  manifest: LoadedDevLauncherManifest,
  runtime: DevLauncherCommandRuntime,
  controller: DevLauncherRemoteProcessController,
  summary: DevLauncherSessionGetResult,
  useTui: boolean,
  options?: {
    allowStartupSelection?: boolean;
    ownSession?: boolean;
    selectedServiceIds?: string[];
  }
) => {
  const currentServiceIds =
    options?.selectedServiceIds ?? summary.session.snapshot.managedServiceIds;

  if (useTui) {
    return await runtime.startTuiSession(manifest, controller, currentServiceIds, {
      allowStartupSelection: options?.allowStartupSelection,
      onRequestExit: options?.ownSession
        ? async () => {
            const client = runtime.createSessionClient(
              manifest,
              summary.session.metadata
            );
            await client.stopSession();
          }
        : async () => undefined,
    });
  }

  return await runtime.runPlainSession(
    manifest,
    controller,
    currentServiceIds,
    {
      allowStartupSelection: options?.allowStartupSelection,
      applyInitialSelection: options?.allowStartupSelection !== false,
      exitWhenSelectionStops: options?.ownSession ?? false,
      onRequestExit: options?.ownSession
        ? async () => {
            const client = runtime.createSessionClient(
              manifest,
              summary.session.metadata
            );
            await client.stopSession();
          }
        : async () => undefined,
    }
  );
};

export const resolveInitialServiceIds = (
  manifest: LoadedDevLauncherManifest,
  options: DevLauncherCommandOptions
): string[] | undefined => {
  if (options.services) {
    return normalizeSelectedServiceIds(
      manifest,
      parseServiceIdsOption(options.services)
    );
  }

  return undefined;
};

export const runDevLauncherCommand = async (
  options: DevLauncherCommandOptions = {},
  runtime: DevLauncherCommandRuntime = defaultRuntime
): Promise<number> => {
  const manifest = await runtime.loadManifest({
    configPath: options.config,
  });
  const initialServiceIds = resolveInitialServiceIds(manifest, options);
  const useTui = !options.noTui && runtime.isInteractiveTuiSupported();
  const existingClient = runtime.createSessionClient(manifest);
  const existingMetadata = await existingClient.resolveSession();

  if (existingMetadata) {
    let summary = await existingClient.getSession();

    if (initialServiceIds && initialServiceIds.length > 0) {
      summary = await existingClient.applyServiceSet(initialServiceIds);
    }

    const controller = runtime.createRemoteController(
      manifest,
      existingClient,
      summary
    );

    return await runAttachedSessionView(
      manifest,
      runtime,
      controller,
      summary,
      useTui,
      {
        allowStartupSelection: false,
      }
    );
  }

  if (manifest.actionIdsInOrder.length > 0) {
    const suggestions = await runtime.getPreflightSuggestions(
      manifest,
      manifest
    );
    for (const suggestion of suggestions) {
      runtime.stdout.write(`${suggestion.message}\n`);
    }
  }

  if (!(options.noTui || runtime.isInteractiveTuiSupported())) {
    runtime.stdout.write(
      'Interactive TTY not available. Falling back to plain mode.\n'
    );
  }

  const server = runtime.createSessionServer(manifest, 'foreground');
  const metadata = await server.start();

  try {
    const { client, controller, summary } = await createAttachedController(
      manifest,
      runtime,
      metadata
    );
    const exitCode = await runAttachedSessionView(
      manifest,
      runtime,
      controller,
      summary,
      useTui,
      {
        allowStartupSelection: true,
        ownSession: true,
        selectedServiceIds: initialServiceIds,
      }
    );

    return exitCode;
  } finally {
    await server.stop().catch(() => undefined);
  }
};

export const runDevLauncherAttachCommand = async (
  options: DevLauncherCommandOptions = {},
  runtime: DevLauncherCommandRuntime = defaultRuntime
): Promise<number> => {
  const manifest = await runtime.loadManifest({
    configPath: options.config,
  });
  const existingClient = runtime.createSessionClient(manifest);
  const existingMetadata = await existingClient.resolveSession();
  if (!existingMetadata) {
    throw createReadOnlyNoSessionError();
  }

  const useTui = !options.noTui && runtime.isInteractiveTuiSupported();
  const summary = await existingClient.getSession();
  const controller = runtime.createRemoteController(
    manifest,
    existingClient,
    summary
  );

  return await runAttachedSessionView(
    manifest,
    runtime,
    controller,
    summary,
    useTui,
    {
      allowStartupSelection: false,
    }
  );
};

export const runDevLauncherHostCommand = async (
  options: DevLauncherSessionHostCommandOptions = {},
  runtime: DevLauncherCommandRuntime = defaultRuntime
): Promise<number> => {
  const manifest = await runtime.loadManifest({
    configPath: options.config,
  });
  const existingClient = runtime.createSessionClient(manifest);
  if (await existingClient.resolveSession()) {
    throw new Error('A dev launcher session is already running for this repo.');
  }

  const initialServiceIds = options.services
    ? normalizeSelectedServiceIds(manifest, parseServiceIdsOption(options.services))
    : undefined;
  const server = runtime.createSessionServer(
    manifest,
    options.headless ? 'headless' : 'foreground'
  );

  const signalHandlers: Array<{
    handler: () => void;
    signal: NodeJS.Signals;
  }> = [];

  await server.start(initialServiceIds);

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    const handler = (): void => {
      void server.stop();
    };
    process.on(signal, handler);
    signalHandlers.push({ handler, signal });
  }

  await server.waitUntilStopped();

  for (const { handler, signal } of signalHandlers) {
    process.off(signal, handler);
  }

  return 0;
};

const ensureMutatingSessionClient = async (
  manifest: LoadedDevLauncherManifest,
  runtime: DevLauncherCommandRuntime
) => {
  const client = runtime.createSessionClient(manifest);
  const existingMetadata = await client.resolveSession();
  if (existingMetadata) {
    return client;
  }

  const bootstrappedMetadata = await runtime.bootstrapSession(manifest);
  return runtime.createSessionClient(manifest, bootstrappedMetadata);
};

export const runDevLauncherStatusCommand = async (
  options: DevLauncherStatusCommandOptions = {},
  runtime: DevLauncherCommandRuntime = defaultRuntime
): Promise<number> => {
  let outputFormat: DevLauncherCommandOutputFormat = 'text';
  try {
    outputFormat = resolveCommandOutputFormat(options);
    const manifest = await runtime.loadManifest({
      configPath: options.config,
    });
    const client = runtime.createSessionClient(manifest);
    const metadata = await client.resolveSession();
    if (!metadata) {
      throw createReadOnlyNoSessionError();
    }

    const summary = await client.getSession();
    if (outputFormat !== 'text') {
      writeStructuredOutput(
        runtime,
        {
          ok: true,
          session: summary.session,
        },
        outputFormat
      );
    } else {
      runtime.stdout.write(
        `Session ${summary.session.metadata.sessionId} (${summary.session.metadata.mode})\n`
      );
      runtime.stdout.write(
        `Managed services: ${summary.session.snapshot.managedServiceIds.join(', ') || 'none'}\n`
      );
    }
    return 0;
  } catch (error) {
    return writeCommandError(runtime, error, outputFormat);
  }
};

const runMutatingServiceCommand = async (
  action: 'restart' | 'start' | 'stop',
  serviceId: string,
  options: DevLauncherStatusCommandOptions,
  runtime: DevLauncherCommandRuntime
): Promise<number> => {
  let outputFormat: DevLauncherCommandOutputFormat = 'text';
  try {
    outputFormat = resolveCommandOutputFormat(options);
    const manifest = await runtime.loadManifest({
      configPath: options.config,
    });
    const client = await ensureMutatingSessionClient(manifest, runtime);
    const summary =
      action === 'start'
        ? await client.startService(serviceId)
        : action === 'stop'
          ? await client.stopService(serviceId)
          : await client.restartService(serviceId);

    if (outputFormat !== 'text') {
      writeStructuredOutput(
        runtime,
        {
          ok: true,
          session: summary.session,
        },
        outputFormat
      );
    } else {
      const actionLabel =
        action === 'start'
          ? 'Started'
          : action === 'stop'
            ? 'Stopped'
            : 'Restarted';
      runtime.stdout.write(
        `${actionLabel} ${manifest.servicesById[serviceId]?.label ?? serviceId}.\n`
      );
    }
    return 0;
  } catch (error) {
    return writeCommandError(runtime, error, outputFormat);
  }
};

export const runDevLauncherServiceStartCommand = async (
  serviceId: string,
  options: DevLauncherStatusCommandOptions = {},
  runtime: DevLauncherCommandRuntime = defaultRuntime
): Promise<number> => {
  return await runMutatingServiceCommand('start', serviceId, options, runtime);
};

export const runDevLauncherServiceStopCommand = async (
  serviceId: string,
  options: DevLauncherStatusCommandOptions = {},
  runtime: DevLauncherCommandRuntime = defaultRuntime
): Promise<number> => {
  return await runMutatingServiceCommand('stop', serviceId, options, runtime);
};

export const runDevLauncherServiceRestartCommand = async (
  serviceId: string,
  options: DevLauncherStatusCommandOptions = {},
  runtime: DevLauncherCommandRuntime = defaultRuntime
): Promise<number> => {
  return await runMutatingServiceCommand('restart', serviceId, options, runtime);
};

export const runDevLauncherServicesApplyCommand = async (
  options: DevLauncherServicesApplyCommandOptions,
  runtime: DevLauncherCommandRuntime = defaultRuntime
): Promise<number> => {
  let outputFormat: DevLauncherCommandOutputFormat = 'text';
  try {
    outputFormat = resolveCommandOutputFormat(options);
    const manifest = await runtime.loadManifest({
      configPath: options.config,
    });
    const client = await ensureMutatingSessionClient(manifest, runtime);
    const summary = await client.applyServiceSet(
      normalizeSelectedServiceIds(manifest, parseServiceIdsOption(options.services))
    );

    if (outputFormat !== 'text') {
      writeStructuredOutput(
        runtime,
        {
          ok: true,
          session: summary.session,
        },
        outputFormat
      );
    } else {
      runtime.stdout.write(
        `Applied service selection: ${summary.session.snapshot.managedServiceIds.join(', ') || 'none'}.\n`
      );
    }
    return 0;
  } catch (error) {
    return writeCommandError(runtime, error, outputFormat);
  }
};

export const runDevLauncherLogsCommand = async (
  serviceId: string,
  options: DevLauncherLogsCommandOptions = {},
  runtime: DevLauncherCommandRuntime = defaultRuntime
): Promise<number> => {
  let outputFormat: DevLauncherCommandOutputFormat = 'text';
  try {
    outputFormat = resolveCommandOutputFormat(options);
    const manifest = await runtime.loadManifest({
      configPath: options.config,
    });
    const client = runtime.createSessionClient(manifest);
    const metadata = await client.resolveSession();
    if (!metadata) {
      throw createReadOnlyNoSessionError();
    }

    let afterSequence = parseOptionalInteger(options.after) ?? 0;
    const limit = parseOptionalInteger(options.limit);

    if (options.follow && outputFormat === 'toon') {
      throw new DevLauncherCommandError(
        'unsupported_output_format',
        'logs --follow does not support TOON output in this phase.'
      );
    }

    if (!options.follow) {
      const result = await client.readLogs({
        afterSequence,
        limit,
        serviceId,
      });
      if (outputFormat !== 'text') {
        writeStructuredOutput(
          runtime,
          {
            entries: result.entries,
            highestSequence: result.highestSequence,
            ok: true,
            serviceId,
          },
          outputFormat
        );
      } else {
        for (const entry of result.entries) {
          runtime.stdout.write(`${formatLogLine(manifest, entry)}\n`);
        }
      }
      return 0;
    }

    while (true) {
      const result = await client.readLogs({
        afterSequence,
        limit,
        serviceId,
      });

      if (outputFormat === 'json') {
        runtime.stdout.write(
          `${JSON.stringify({
            highestSequence: result.highestSequence,
            entries: result.entries,
            ok: true,
            serviceId,
          })}\n`
        );
      } else {
        for (const entry of result.entries) {
          runtime.stdout.write(`${formatLogLine(manifest, entry)}\n`);
        }
      }

      afterSequence = result.highestSequence;
      await new Promise<void>((resolve) => {
        runtime.clientRuntime.setTimeout(resolve, 500);
      });
    }
  } catch (error) {
    return writeCommandError(runtime, error, outputFormat);
  }
};

export const runDevLauncherSessionStopCommand = async (
  options: DevLauncherStatusCommandOptions = {},
  runtime: DevLauncherCommandRuntime = defaultRuntime
): Promise<number> => {
  let outputFormat: DevLauncherCommandOutputFormat = 'text';
  try {
    outputFormat = resolveCommandOutputFormat(options);
    const manifest = await runtime.loadManifest({
      configPath: options.config,
    });
    const client = runtime.createSessionClient(manifest);
    const metadata = await client.resolveSession();
    if (!metadata) {
      throw createReadOnlyNoSessionError();
    }

    await client.stopSession();
    if (outputFormat !== 'text') {
      writeStructuredOutput(
        runtime,
        {
          ok: true,
          stopped: true,
        },
        outputFormat
      );
    } else {
      runtime.stdout.write('Stopped the dev launcher session.\n');
    }
    return 0;
  } catch (error) {
    return writeCommandError(runtime, error, outputFormat);
  }
};
