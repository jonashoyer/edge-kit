import { describe, expect, it, vi } from 'vitest';
import {
  runDevLauncherLogsCommand,
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
    stopSession: vi.fn(async () => ({ stopped: true as const })),
  };

  return {
    client,
    runtime: {
      clientRuntime: {
        setTimeout,
      },
      createSessionClient: vi.fn(() => client),
      loadManifest: vi.fn(async () => createManifest()),
      stderr,
      stdout,
    },
    stderr,
    stdout,
  };
};

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

  it('keeps --json as the stable alias even when --toon is passed', async () => {
    const { runtime, stdout } = createRuntime();

    await runDevLauncherStatusCommand(
      {
        json: true,
        toon: true,
      },
      runtime as never
    );

    expect(stdout.write).toHaveBeenCalledWith(
      expect.stringContaining('"ok": true')
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
    ).rejects.toThrow('logs --follow does not support TOON output in this phase.');

    expect(stdout.write).toHaveBeenCalledWith(
      expect.stringContaining('ok: false')
    );
    expect(stdout.write).toHaveBeenCalledWith(
      expect.stringContaining('unsupported_output_format')
    );
  });
});
