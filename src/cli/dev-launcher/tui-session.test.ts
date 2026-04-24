import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedDevAction } from './action-runner';
import type { DevLauncherProcessController } from './process-manager';
import { startDevLauncherTuiSession } from './tui';
import type {
  DevActionRunExecutionResult,
  LoadedDevLauncherManifest,
  ManagedDevServiceState,
} from './types';

const { renderMock } = vi.hoisted(() => ({
  renderMock: vi.fn(() => ({
    unmount: vi.fn(),
  })),
}));

vi.mock('ink', () => ({
  Box: 'box',
  render: renderMock,
  Text: 'text',
  useApp: () => ({
    exit: vi.fn(),
  }),
  useInput: vi.fn(),
}));

const createManifest = (): LoadedDevLauncherManifest => ({
  actionIdsInOrder: [],
  actionsById: {},
  configPath: '/repo/dev-cli.config.ts',
  packageManager: 'pnpm',
  repoRoot: '/repo',
  serviceIdsInOrder: ['tests'],
  servicesById: {
    tests: {
      label: 'Tests',
      target: {
        kind: 'root-script',
        script: 'test',
      },
    },
  },
  version: 1,
});

const createController = (): DevLauncherProcessController => ({
  applyServiceSet: vi.fn(async () => undefined),
  getSnapshot: vi.fn(() => ({
    allLogs: [],
    logsByServiceId: {
      tests: [],
    },
    managedServiceIds: [],
    serviceStates: {
      tests: {
        exitCode: null,
        exitSignal: null,
        lastStartedAt: null,
        lastStoppedAt: null,
        lastUpdatedAt: 0,
        pid: null,
        runId: 0,
        serviceId: 'tests',
        status: 'idle',
      } satisfies ManagedDevServiceState,
    },
  })),
  restartService: vi.fn(async () => undefined),
  startService: vi.fn(async () => undefined),
  stopAll: vi.fn(async () => undefined),
  stopService: vi.fn(async () => undefined),
  subscribe: vi.fn(() => () => undefined),
  waitUntilIdle: vi.fn(async () => undefined),
});

const createRuntime = (controller: DevLauncherProcessController) => ({
  createController: vi.fn(() => controller),
  listActions: vi.fn(async (): Promise<ResolvedDevAction[]> => []),
  openExternalUrl: vi.fn(async () => undefined),
  runDevAction: vi.fn(
    async (): Promise<DevActionRunExecutionResult> => ({
      action: {
        available: true,
        id: 'noop',
        impactPolicy: 'parallel',
        label: 'No-op',
        suggestInDev: false,
      },
      forced: false,
      summary: 'No-op.',
    })
  ),
  stderr: process.stderr,
  stdin: process.stdin,
  stdout: process.stdout,
});

describe('startDevLauncherTuiSession', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('waits for the app to request exit when startup begins with no selected services', async () => {
    const controller = createController();
    const runtime = createRuntime(controller);
    const manifest = createManifest();
    let resolved = false;

    const sessionPromise = startDevLauncherTuiSession(
      manifest,
      runtime,
      undefined,
      {
        allowStartupSelection: true,
      }
    ).then((exitCode) => {
      resolved = true;
      return exitCode;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(controller.subscribe).not.toHaveBeenCalled();
    expect(resolved).toBe(false);

    const renderedApp = renderMock.mock.calls[0]?.[0];
    expect(renderedApp?.props.onExitCode).toBeTypeOf('function');

    renderedApp.props.onExitCode(0);

    await expect(sessionPromise).resolves.toBe(0);
  });
});
