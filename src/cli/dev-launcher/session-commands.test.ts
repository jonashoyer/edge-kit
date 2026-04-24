import { describe, expect, it, vi } from 'vitest';
import {
  DevLauncherSessionAccess,
  type DevLauncherSessionAccessRuntime,
} from './session-access';
import { DevLauncherSessionClientError } from './session-client';
import {
  runDevLauncherLogsCommand,
  runDevLauncherServiceStartCommand,
  runDevLauncherSessionStopCommand,
  runDevLauncherStatusCommand,
} from './session-commands';
import type {
  DevLauncherLogsReadResult,
  DevLauncherSessionGetResult,
  DevLauncherSessionMetadata,
  LoadedDevLauncherManifest,
} from './types';

const createManifest = (): LoadedDevLauncherManifest => ({
  actionIdsInOrder: [],
  actionsById: {},
  configPath: '/repo/dev-cli.config.ts',
  packageManager: 'pnpm',
  repoRoot: '/repo',
  serviceIdsInOrder: ['app'],
  servicesById: {
    app: {
      label: 'App',
      target: {
        kind: 'root-script',
        script: 'dev:app',
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

const createSessionSummary = (): DevLauncherSessionGetResult => ({
  session: {
    metadata: createSessionMetadata(),
    snapshot: {
      allLogs: [],
      logsByServiceId: {
        app: [],
      },
      managedServiceIds: ['app'],
      serviceStates: {
        app: {
          exitCode: null,
          exitSignal: null,
          lastStartedAt: null,
          lastStoppedAt: null,
          lastUpdatedAt: 1,
          pid: 456,
          runId: 1,
          serviceId: 'app',
          status: 'running',
        },
      },
    },
  },
});

const createLogsResult = (): DevLauncherLogsReadResult => ({
  entries: [
    {
      line: 'started',
      runId: 1,
      sequence: 4,
      serviceId: 'app',
      stream: 'system',
      timestamp: 4,
    },
  ],
  highestSequence: 4,
});

const createSessionAccessRuntime = (overrides?: {
  bootstrapSession?: () => Promise<DevLauncherSessionMetadata>;
  getSession?: () => Promise<DevLauncherSessionGetResult>;
  resolveSession?: () => Promise<DevLauncherSessionMetadata | null>;
  stopSession?: () => Promise<{ stopped: true }>;
}) => {
  const client = {
    getSession: vi.fn(
      overrides?.getSession ?? (async () => createSessionSummary())
    ),
    resolveSession: vi.fn(
      overrides?.resolveSession ?? (async () => createSessionMetadata())
    ),
    stopSession: vi.fn(
      overrides?.stopSession ?? (async () => ({ stopped: true as const }))
    ),
  };
  const createRemoteController = vi.fn((_manifest, _client, summary) => ({
    initialSummary: summary,
  }));
  const runtime: DevLauncherSessionAccessRuntime = {
    bootstrapSession: vi.fn(
      overrides?.bootstrapSession ?? (async () => createSessionMetadata())
    ),
    clientRuntime: {
      setTimeout,
    } as never,
    createRemoteController,
    createSessionClient: vi.fn(() => client as never),
  };

  return {
    client,
    createRemoteController,
    runtime,
  };
};

const createRuntime = () => {
  const stdout = {
    write: vi.fn(),
  } as unknown as NodeJS.WriteStream;
  const stderr = {
    write: vi.fn(),
  } as unknown as NodeJS.WriteStream;
  const client = {
    getSession: vi.fn(async () => createSessionSummary()),
    readLogs: vi.fn(async () => createLogsResult()),
    resolveSession: vi.fn(async () => createSessionMetadata()),
    startService: vi.fn(async () => createSessionSummary()),
    stopSession: vi.fn(async () => ({ stopped: true as const })),
  };

  return {
    client,
    runtime: {
      bootstrapSession: vi.fn(async () => createSessionMetadata()),
      clientRuntime: {
        setTimeout,
      },
      createRemoteController: vi.fn((_manifest, _client, summary) => ({
        initialSummary: summary,
      })),
      createSessionClient: vi.fn(() => client),
      loadManifest: vi.fn(async () => createManifest()),
      stderr,
      stdout,
    },
    stderr,
    stdout,
  };
};

describe('DevLauncherSessionAccess', () => {
  it('fails read-only access with no_session when no session exists', async () => {
    const { runtime } = createSessionAccessRuntime({
      resolveSession: async () => null,
    });

    await expect(
      new DevLauncherSessionAccess(createManifest(), runtime).resolve(
        'read_only'
      )
    ).rejects.toMatchObject<Partial<DevLauncherSessionClientError>>({
      errorCode: 'no_session',
      message: 'No dev launcher session is running for this repo.',
    });
  });

  it('bootstraps mutating access when no session exists', async () => {
    const metadata = createSessionMetadata();
    const { client, runtime } = createSessionAccessRuntime({
      bootstrapSession: async () => metadata,
      resolveSession: async () => null,
    });

    const access = await new DevLauncherSessionAccess(
      createManifest(),
      runtime
    ).resolve('mutating');

    expect(runtime.bootstrapSession).toHaveBeenCalledTimes(1);
    expect(runtime.createSessionClient).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      metadata
    );
    expect(access.client).toBe(client);
  });

  it('maps transport closure to no_session domain errors', async () => {
    const { runtime } = createSessionAccessRuntime({
      getSession: async () => {
        throw new DevLauncherSessionClientError(
          'socket_closed',
          'Dev launcher session closed before responding.'
        );
      },
    });

    await expect(
      new DevLauncherSessionAccess(createManifest(), runtime).resolve(
        'read_only'
      )
    ).rejects.toMatchObject<Partial<DevLauncherSessionClientError>>({
      errorCode: 'no_session',
      message: 'No dev launcher session is running for this repo.',
    });
  });
});

describe('session-commands output formatting', () => {
  it('renders status in TOON format', async () => {
    const { runtime, stdout } = createRuntime();

    await runDevLauncherStatusCommand(
      {
        toon: true,
      },
      runtime as never
    );

    expect(stdout.write).toHaveBeenCalledWith(
      expect.stringContaining('ok: true')
    );
    expect(stdout.write).toHaveBeenCalledWith(
      expect.stringContaining('session:')
    );
  });

  it('renders logs in TOON format when not following', async () => {
    const { client, runtime, stdout } = createRuntime();

    await runDevLauncherLogsCommand(
      'app',
      {
        toon: true,
      },
      runtime as never
    );

    expect(client.readLogs).toHaveBeenCalledWith({
      afterSequence: 0,
      limit: undefined,
      serviceId: 'app',
    });
    expect(stdout.write).toHaveBeenCalledWith(
      expect.stringContaining('entries[1]')
    );
  });

  it('rejects TOON output for logs --follow', async () => {
    const { runtime, stdout } = createRuntime();

    await expect(
      runDevLauncherLogsCommand(
        'app',
        {
          follow: true,
          toon: true,
        },
        runtime as never
      )
    ).rejects.toThrow(
      'logs --follow does not support TOON output in this phase.'
    );

    expect(stdout.write).toHaveBeenCalledWith(
      expect.stringContaining('ok: false')
    );
    expect(stdout.write).toHaveBeenCalledWith(
      expect.stringContaining('unsupported_output_format')
    );
  });

  it('uses mutating session access for service start commands', async () => {
    const { client, runtime } = createRuntime();

    await runDevLauncherServiceStartCommand('app', {}, runtime as never);

    expect(runtime.createSessionClient).toHaveBeenCalledTimes(1);
    expect(client.startService).toHaveBeenCalledWith('app');
  });

  it('maps stop transport failures to no_session for session stop', async () => {
    const { client, runtime, stdout } = createRuntime();
    client.stopSession = vi.fn(async () => {
      throw new DevLauncherSessionClientError(
        'socket_error',
        'connect ENOENT /tmp/edge-kit.sock'
      );
    });

    await expect(
      runDevLauncherSessionStopCommand({}, runtime as never)
    ).rejects.toMatchObject<Partial<DevLauncherSessionClientError>>({
      errorCode: 'no_session',
      message: 'No dev launcher session is running for this repo.',
    });

    expect(stdout.write).not.toHaveBeenCalledWith(
      'Stopped the dev launcher session.\n'
    );
  });
});
