import { describe, expect, it, vi } from 'vitest';
import { runPlainDevSession } from './plain-runner';
import type { DevLauncherProcessController } from './process-manager';

const {
  loadRecentDevServiceSelectionsMock,
  saveRecentDevServiceSelectionMock,
} = vi.hoisted(() => ({
  loadRecentDevServiceSelectionsMock: vi.fn(() => []),
  saveRecentDevServiceSelectionMock: vi.fn(),
}));

vi.mock('./selection-history', () => ({
  loadRecentDevServiceSelections: loadRecentDevServiceSelectionsMock,
  saveRecentDevServiceSelection: saveRecentDevServiceSelectionMock,
}));

import type {
  DevLauncherSupervisorSnapshot,
  LoadedDevLauncherManifest,
  ManagedDevServiceState,
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
        script: 'dev',
      },
    },
  },
  version: 1,
});

const createServiceState = (
  status: ManagedDevServiceState['status']
): ManagedDevServiceState => ({
  exitCode: null,
  exitSignal: null,
  lastStartedAt: null,
  lastStoppedAt: null,
  lastUpdatedAt: 1,
  pid: null,
  runId: 0,
  serviceId: 'app',
  status,
});

const createSnapshot = (): DevLauncherSupervisorSnapshot => ({
  allLogs: [],
  logsByServiceId: {
    app: [],
  },
  managedServiceIds: [],
  serviceStates: {
    app: createServiceState('idle'),
  },
});

class FakeController implements DevLauncherProcessController {
  readonly applyServiceSet = vi.fn(async () => undefined);
  readonly restartService = vi.fn(async () => undefined);
  readonly startService = vi.fn(async () => undefined);
  readonly stopAll = vi.fn(async () => undefined);
  readonly stopService = vi.fn(async () => undefined);
  readonly subscribe = vi.fn((listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.unsubscribeCount += 1;
      this.listeners.delete(listener);
    };
  });
  readonly waitUntilIdle = vi.fn(async () => undefined);
  listeners = new Set<() => void>();
  snapshot = createSnapshot();
  unsubscribeCount = 0;

  getSnapshot(): DevLauncherSupervisorSnapshot {
    return this.snapshot;
  }
}

describe('runPlainDevSession', () => {
  it('uses recent selection in non-interactive mode and persists launch selection', async () => {
    const controller = new FakeController();
    loadRecentDevServiceSelectionsMock.mockReturnValue([['app']]);
    const stdoutWrite = vi.fn();

    const exitCode = await runPlainDevSession(createManifest(), {
      canPrompt: false,
      createController: () => controller,
      prompt: async () => ({}),
      stderr: {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream,
      stdout: {
        write: stdoutWrite,
      } as unknown as NodeJS.WriteStream,
    });

    expect(exitCode).toBe(0);
    expect(controller.applyServiceSet).toHaveBeenCalledWith(['app']);
    expect(saveRecentDevServiceSelectionMock).toHaveBeenCalledWith(
      createManifest(),
      ['app']
    );
    expect(stdoutWrite).toHaveBeenCalledWith('Launching App...\n');
  });

  it('cleans up both controller subscriptions after exit', async () => {
    const controller = new FakeController();

    const exitCode = await runPlainDevSession(
      createManifest(),
      {
        canPrompt: false,
        createController: () => controller,
        prompt: async () => ({}),
        stderr: {
          write: vi.fn(),
        } as unknown as NodeJS.WriteStream,
        stdout: {
          write: vi.fn(),
        } as unknown as NodeJS.WriteStream,
      },
      undefined,
      {
        allowStartupSelection: false,
        applyInitialSelection: false,
      }
    );

    expect(exitCode).toBe(0);
    expect(controller.subscribe).toHaveBeenCalledTimes(2);
    expect(controller.unsubscribeCount).toBe(2);
  });
});
