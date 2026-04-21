import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevLauncherProcessController } from './process-manager';
import {
  applySessionServiceSelection,
  promptForServiceSelection,
  requestSessionViewExit,
  resolveSessionStartupSelection,
} from './session-view-orchestrator';
import type {
  DevLauncherSupervisorSnapshot,
  LoadedDevLauncherManifest,
  ManagedDevServiceState,
} from './types';

const {
  loadRecentDevServiceSelectionsMock,
  saveRecentDevServiceSelectionMock,
} = vi.hoisted(() => ({
  loadRecentDevServiceSelectionsMock: vi.fn(),
  saveRecentDevServiceSelectionMock: vi.fn(),
}));

vi.mock('./selection-history', () => ({
  loadRecentDevServiceSelections: loadRecentDevServiceSelectionsMock,
  saveRecentDevServiceSelection: saveRecentDevServiceSelectionMock,
}));

const createManifest = (): LoadedDevLauncherManifest => ({
  actionIdsInOrder: [],
  actionsById: {},
  configPath: '/repo/dev-cli.config.ts',
  packageManager: 'pnpm',
  repoRoot: '/repo',
  serviceIdsInOrder: ['app', 'api'],
  servicesById: {
    api: {
      label: 'API',
      target: {
        kind: 'root-script',
        script: 'dev:api',
      },
    },
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

const createServiceState = (
  serviceId: string,
  status: ManagedDevServiceState['status']
): ManagedDevServiceState => ({
  exitCode: null,
  exitSignal: null,
  lastStartedAt: null,
  lastStoppedAt: null,
  lastUpdatedAt: 1,
  pid: null,
  runId: 0,
  serviceId,
  status,
});

const createController = (): DevLauncherProcessController => ({
  applyServiceSet: vi.fn(async () => undefined),
  getSnapshot: vi.fn(
    (): DevLauncherSupervisorSnapshot => ({
      allLogs: [],
      logsByServiceId: {
        api: [],
        app: [],
      },
      managedServiceIds: [],
      serviceStates: {
        api: createServiceState('api', 'idle'),
        app: createServiceState('app', 'idle'),
      },
    })
  ),
  restartService: vi.fn(async () => undefined),
  startService: vi.fn(async () => undefined),
  stopAll: vi.fn(async () => undefined),
  stopService: vi.fn(async () => undefined),
  subscribe: vi.fn(() => () => undefined),
  waitUntilIdle: vi.fn(async () => undefined),
});

describe('session-view-orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadRecentDevServiceSelectionsMock.mockReturnValue([]);
  });

  it('uses explicit initial ids before startup selection policy', () => {
    loadRecentDevServiceSelectionsMock.mockReturnValue([['api']]);

    const selection = resolveSessionStartupSelection(createManifest(), ['app']);

    expect(selection).toEqual({
      recentSelections: [['api']],
      selectedServiceIds: ['app'],
      source: 'explicit',
    });
  });

  it('uses recent history for non-interactive fallback before all services', () => {
    loadRecentDevServiceSelectionsMock.mockReturnValue([['api']]);

    const selection = resolveSessionStartupSelection(createManifest());

    expect(selection).toEqual({
      recentSelections: [['api']],
      selectedServiceIds: ['api'],
      source: 'non_interactive_fallback',
    });
  });

  it('falls back to all services when no history exists', () => {
    const selection = resolveSessionStartupSelection(createManifest());

    expect(selection).toEqual({
      recentSelections: [],
      selectedServiceIds: ['app', 'api'],
      source: 'non_interactive_fallback',
    });
  });

  it('prompts for a custom selection after choosing startup custom', async () => {
    loadRecentDevServiceSelectionsMock.mockReturnValue([['app']]);
    const prompt = vi
      .fn()
      .mockResolvedValueOnce({ selection: 'custom' })
      .mockResolvedValueOnce({ serviceIds: ['api'] });

    const selection = await promptForServiceSelection(
      createManifest(),
      {
        canPrompt: true,
        prompt,
      },
      undefined,
      {
        allowStartupSelection: true,
      }
    );

    expect(selection).toEqual(['api']);
    expect(prompt).toHaveBeenCalledTimes(2);
  });

  it('applies and persists normalized selections', async () => {
    const controller = createController();

    const selection = await applySessionServiceSelection(
      createManifest(),
      controller,
      ['api', 'app']
    );

    expect(selection).toEqual(['app', 'api']);
    expect(controller.applyServiceSet).toHaveBeenCalledWith(['app', 'api']);
    expect(saveRecentDevServiceSelectionMock).toHaveBeenCalledWith(
      createManifest(),
      ['app', 'api']
    );
  });

  it('delegates exit requests when requested', async () => {
    const controller = createController();
    const onRequestExit = vi.fn(async () => undefined);

    await requestSessionViewExit({
      controller,
      exitCode: 1,
      onRequestExit,
      shouldDelegateExit: true,
    });

    expect(onRequestExit).toHaveBeenCalledWith({
      controller,
      exitCode: 1,
    });
    expect(controller.stopAll).not.toHaveBeenCalled();
  });

  it('stops all services directly without a delegated exit handler', async () => {
    const controller = createController();

    await requestSessionViewExit({
      controller,
      exitCode: 0,
    });

    expect(controller.stopAll).toHaveBeenCalledTimes(1);
  });
});
