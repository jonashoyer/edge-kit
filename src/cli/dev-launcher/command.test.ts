import { describe, expect, it, vi } from 'vitest';
import type { DevActionSuggestion } from './action-runner';
import {
  resolveInitialServiceIds,
  runDevLauncherCommand,
} from './session-commands';
import type {
  DevLauncherSessionGetResult,
  DevLauncherSessionMetadata,
  LoadedDevLauncherManifest,
} from './types';

const createManifest = (): LoadedDevLauncherManifest => ({
  actionIdsInOrder: ['install-deps'],
  actionsById: {
    'install-deps': {
      impactPolicy: 'stop-all',
      label: 'Install dependencies',
      run: async () => {},
      suggestInDev: true,
    },
  },
  configPath: '/repo/dev-cli.config.ts',
  packageManager: 'pnpm',
  repoRoot: '/repo',
  serviceIdsInOrder: ['app', 'api'],
  servicesById: {
    app: {
      label: 'App',
      target: {
        kind: 'root-script',
        script: 'dev:app',
      },
    },
    api: {
      label: 'API',
      target: {
        kind: 'root-script',
        script: 'dev:api',
      },
    },
  },
  version: 1,
});

const createSessionMetadata = (): DevLauncherSessionMetadata => ({
  mode: 'foreground',
  pid: 123,
  repoRoot: '/repo',
  sessionId: 'session-1',
  socketPath: '/tmp/edge-kit.sock',
  startedAt: 1,
  version: 1,
});

const createSessionSummary = (
  serviceIds: string[] = []
): DevLauncherSessionGetResult => ({
  session: {
    metadata: createSessionMetadata(),
    snapshot: {
      allLogs: [],
      logsByServiceId: {
        api: [],
        app: [],
      },
      managedServiceIds: serviceIds,
      serviceStates: {
        api: {
          exitCode: null,
          exitSignal: null,
          lastStartedAt: null,
          lastStoppedAt: null,
          lastUpdatedAt: 1,
          pid: null,
          runId: 0,
          serviceId: 'api',
          status: 'idle',
        },
        app: {
          exitCode: null,
          exitSignal: null,
          lastStartedAt: null,
          lastStoppedAt: null,
          lastUpdatedAt: 1,
          pid: null,
          runId: 0,
          serviceId: 'app',
          status: 'idle',
        },
      },
    },
  },
});

const createRuntime = (overrides?: {
  existingSession?: boolean;
  interactive?: boolean;
  preflightSuggestions?: DevActionSuggestion[];
}) => {
  const manifest = createManifest();
  const stdout = {
    write: vi.fn(),
  } as unknown as NodeJS.WriteStream;
  const startTuiSession = vi.fn(async () => 0);
  const runPlainSession = vi.fn(async () => 0);
  const createRemoteController = vi.fn(() => {
    return {
      applyServiceSet: vi.fn(async () => undefined),
      getSnapshot: vi.fn(() => createSessionSummary().session.snapshot),
      restartService: vi.fn(async () => undefined),
      startService: vi.fn(async () => undefined),
      stopAll: vi.fn(async () => undefined),
      stopService: vi.fn(async () => undefined),
      subscribe: vi.fn(() => () => undefined),
      waitUntilIdle: vi.fn(async () => undefined),
    };
  });
  const existingClient = {
    applyServiceSet: vi.fn(async (serviceIds: string[]) => {
      return createSessionSummary(serviceIds);
    }),
    getSession: vi.fn(async () => createSessionSummary(['app'])),
    resolveSession: vi.fn(async () => {
      return overrides?.existingSession ? createSessionMetadata() : null;
    }),
    stopSession: vi.fn(async () => ({ stopped: true as const })),
  };
  const attachedClient = {
    applyServiceSet: vi.fn(async (serviceIds: string[]) => {
      return createSessionSummary(serviceIds);
    }),
    getSession: vi.fn(async () => createSessionSummary()),
    resolveSession: vi.fn(async () => createSessionMetadata()),
    stopSession: vi.fn(async () => ({ stopped: true as const })),
  };
  const sessionServer = {
    start: vi.fn(async () => createSessionMetadata()),
    stop: vi.fn(async () => undefined),
    waitUntilStopped: vi.fn(async () => undefined),
  };

  return {
    attachedClient,
    createRemoteController,
    existingClient,
    runPlainSession,
    runtime: {
      bootstrapSession: vi.fn(),
      clientRuntime: {
        setTimeout,
      },
      createRemoteController,
      createSessionClient: vi.fn((_loadedManifest, metadata) => {
        return metadata ? attachedClient : existingClient;
      }),
      createSessionServer: vi.fn(() => sessionServer),
      getPreflightSuggestions: vi.fn(async () => {
        return overrides?.preflightSuggestions ?? [];
      }),
      isInteractiveTuiSupported: () => overrides?.interactive ?? true,
      loadManifest: vi.fn(async () => manifest),
      runPlainSession,
      sessionStateRuntime: {} as never,
      startTuiSession,
      stderr: process.stderr,
      stdout,
    },
    sessionServer,
    startTuiSession,
    stdout,
  };
};

describe('runDevLauncherCommand', () => {
  it('resolves explicit service selections', () => {
    const manifest = createManifest();

    expect(resolveInitialServiceIds(manifest, { services: 'api,app' })).toEqual(
      ['app', 'api']
    );
  });

  it('starts a foreground host and uses plain mode when --no-tui is provided', async () => {
    const { runPlainSession, runtime, sessionServer, startTuiSession } =
      createRuntime();

    await runDevLauncherCommand({ noTui: true }, runtime as never);

    expect(sessionServer.start).toHaveBeenCalledTimes(1);
    expect(runPlainSession).toHaveBeenCalledTimes(1);
    expect(startTuiSession).not.toHaveBeenCalled();
  });

  it('falls back to plain mode when no interactive TTY is available', async () => {
    const { runPlainSession, runtime, startTuiSession, stdout } = createRuntime(
      {
        interactive: false,
      }
    );

    await runDevLauncherCommand({}, runtime as never);

    expect(runPlainSession).toHaveBeenCalledTimes(1);
    expect(startTuiSession).not.toHaveBeenCalled();
    expect(stdout.write).toHaveBeenCalledWith(
      'Interactive TTY not available. Falling back to plain mode.\n'
    );
  });

  it('passes explicit service selections to a new foreground session', async () => {
    const { runPlainSession, runtime } = createRuntime();

    await runDevLauncherCommand(
      { noTui: true, services: 'api' },
      runtime as never
    );

    expect(runPlainSession).toHaveBeenCalledTimes(1);
    expect(runPlainSession.mock.calls[0]?.[2]).toEqual(['api']);
  });

  it('prints preflight suggestions before starting a new session', async () => {
    const { runtime, stdout } = createRuntime({
      preflightSuggestions: [
        {
          action: {
            available: true,
            id: 'install-deps',
            impactPolicy: 'stop-all',
            label: 'Install dependencies',
            suggestInDev: true,
          },
          message:
            'Action available before starting services: install-deps - run pnpm cli action run install-deps',
        },
      ],
    });

    await runDevLauncherCommand({ noTui: true }, runtime as never);

    expect(runtime.getPreflightSuggestions).toHaveBeenCalledTimes(1);
    expect(stdout.write).toHaveBeenCalledWith(
      'Action available before starting services: install-deps - run pnpm cli action run install-deps\n'
    );
  });

  it('attaches to an existing session instead of starting a new host', async () => {
    const { createRemoteController, existingClient, runPlainSession, runtime } =
      createRuntime({
        existingSession: true,
      });

    await runDevLauncherCommand(
      { noTui: true, services: 'api' },
      runtime as never
    );

    expect(runtime.createSessionServer).not.toHaveBeenCalled();
    expect(existingClient.applyServiceSet).toHaveBeenCalledWith(['api']);
    expect(createRemoteController).toHaveBeenCalledTimes(1);
    expect(runPlainSession).toHaveBeenCalledTimes(1);
  });
});
