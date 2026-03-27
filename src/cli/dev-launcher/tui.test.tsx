import { render } from 'ink-testing-library';
/* biome-ignore lint/correctness/noUnusedImports: React must stay in scope for this JSX runtime path. */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DevLauncherDashboardApp } from './tui';
import type { ResolvedDevAction } from './action-runner';
import type {
  DevLauncherLogEntry,
  DevLauncherSupervisorSnapshot,
  LoadedDevLauncherManifest,
  ManagedDevServiceState,
} from './types';

vi.mock('./selection-history', () => ({
  loadRecentDevServiceSelections: vi.fn(() => [['app']]),
  saveRecentDevServiceSelection: vi.fn(),
}));

const createManifest = (): LoadedDevLauncherManifest => ({
  actionIdsInOrder: [],
  actionsById: {},
  configPath: '/repo/dev-cli.config.ts',
  packageManager: 'pnpm',
  repoRoot: '/repo',
  serviceIdsInOrder: ['app', 'api'],
  servicesById: {
    app: {
      label: 'App',
      openUrl: 'http://localhost:3000',
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
  runId: 1,
  serviceId,
  status,
});

const createSnapshot = (options?: {
  logsByServiceId?: Record<string, DevLauncherLogEntry[]>;
  managedServiceIds?: string[];
  statuses?: Record<string, ManagedDevServiceState['status']>;
}): DevLauncherSupervisorSnapshot => {
  const managedServiceIds = options?.managedServiceIds ?? [];
  const logsByServiceId = options?.logsByServiceId ?? {
    api: [],
    app: [],
  };
  const statuses = options?.statuses ?? {};

  return {
    allLogs: managedServiceIds.flatMap((serviceId) => {
      return logsByServiceId[serviceId] ?? [];
    }),
    logsByServiceId,
    managedServiceIds,
    serviceStates: {
      api: createServiceState('api', statuses.api ?? 'idle'),
      app: createServiceState('app', statuses.app ?? 'idle'),
    },
  };
};

class FakeController {
  readonly applyServiceSet = vi.fn(async (serviceIds: Iterable<string>) => {
    this.snapshot = createSnapshot({
      logsByServiceId: this.logsByServiceId,
      managedServiceIds: Array.from(serviceIds),
      statuses: this.statuses,
    });
    this.emit();
  });

  readonly restartService = vi.fn(async () => undefined);
  readonly startService = vi.fn(async () => undefined);
  readonly stopAll = vi.fn(async () => undefined);
  readonly stopService = vi.fn(async () => undefined);
  logsByServiceId: Record<string, DevLauncherLogEntry[]> = {
    api: [],
    app: [],
  };
  snapshot: DevLauncherSupervisorSnapshot;
  statuses: Record<string, ManagedDevServiceState['status']> = {};

  readonly #listeners = new Set<() => void>();

  constructor(snapshot: DevLauncherSupervisorSnapshot) {
    this.snapshot = snapshot;
    this.logsByServiceId = snapshot.logsByServiceId;
  }

  getSnapshot(): DevLauncherSupervisorSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  waitUntilIdle(): Promise<void> {
    return Promise.resolve();
  }

  emit(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

const flush = async (iterations = 2) => {
  for (let index = 0; index < iterations; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

describe('DevLauncherDashboardApp', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the startup dashboard with presets and custom selection', () => {
    const controller = new FakeController(createSnapshot());
    const { lastFrame } = render(
      <DevLauncherDashboardApp
        controller={controller}
        manifest={createManifest()}
        onExitCode={() => undefined}
      />
    );

    expect(lastFrame()).toContain('Start a dev session');
    expect(lastFrame()).toContain('App');
    expect(lastFrame()).toContain('Custom selection');
  });

  it('supports custom service selection from startup', async () => {
    const controller = new FakeController(createSnapshot());
    const { stdin } = render(
      <DevLauncherDashboardApp
        controller={controller}
        manifest={createManifest()}
        onExitCode={() => undefined}
      />
    );

    stdin.write('\u001B[B');
    await flush();
    stdin.write('\r');
    await flush();
    stdin.write(' ');
    await flush();
    stdin.write('\r');
    await flush();

    expect(controller.applyServiceSet).toHaveBeenCalledWith(['app']);
  });

  it('opens a focused log mode that hides the sidebar and can return to the dashboard', async () => {
    const appLog: DevLauncherLogEntry = {
      line: 'app ready',
      runId: 1,
      sequence: 1,
      serviceId: 'app',
      stream: 'stdout',
      timestamp: 1,
    };
    const apiLog: DevLauncherLogEntry = {
      line: 'api ready',
      runId: 1,
      sequence: 2,
      serviceId: 'api',
      stream: 'stdout',
      timestamp: 2,
    };
    const controller = new FakeController(
      createSnapshot({
        logsByServiceId: {
          api: [apiLog],
          app: [appLog],
        },
        managedServiceIds: ['app', 'api'],
        statuses: {
          api: 'running',
          app: 'running',
        },
      })
    );
    const { lastFrame, stdin } = render(
      <DevLauncherDashboardApp
        controller={controller}
        initialServiceIds={['app', 'api']}
        manifest={createManifest()}
        onExitCode={() => undefined}
      />
    );

    await flush();
    stdin.write('\u001B[B');
    await flush(6);
    stdin.write('\r');
    await flush(8);

    expect(lastFrame()).toContain('App log');
    expect(lastFrame()).toContain('app ready');
    expect(lastFrame()).not.toContain('API');
    expect(lastFrame()).not.toContain('All logs');

    stdin.write('\u001B');
    await flush(6);

    expect(lastFrame()).toContain('Dev dashboard');
    expect(lastFrame()).toContain('All logs');
  });

  it('opens the selected service url from the dashboard', async () => {
    const controller = new FakeController(
      createSnapshot({
        managedServiceIds: ['app'],
        statuses: {
          app: 'running',
        },
      })
    );
    const openExternalUrl = vi.fn(async () => undefined);
    const { stdin } = render(
      <DevLauncherDashboardApp
        controller={controller}
        initialServiceIds={['app']}
        manifest={createManifest()}
        onExitCode={() => undefined}
        openExternalUrl={openExternalUrl}
      />
    );

    await flush();
    stdin.write('\u001B[B');
    await flush(6);
    stdin.write('o');
    await flush();

    expect(openExternalUrl).toHaveBeenCalledWith('http://localhost:3000');
  });

  it('opens the focused service url with the open shortcut', async () => {
    const controller = new FakeController(
      createSnapshot({
        managedServiceIds: ['app'],
        statuses: {
          app: 'running',
        },
      })
    );
    const openExternalUrl = vi.fn(async () => undefined);
    const { stdin } = render(
      <DevLauncherDashboardApp
        controller={controller}
        initialServiceIds={['app']}
        manifest={createManifest()}
        onExitCode={() => undefined}
        openExternalUrl={openExternalUrl}
      />
    );

    await flush();
    stdin.write('\u001B[B');
    await flush(6);
    stdin.write('\r');
    await flush(8);
    stdin.write('o');
    await flush();

    expect(openExternalUrl).toHaveBeenCalledWith('http://localhost:3000');
  });

  it('keeps focused-mode scrolling isolated from dashboard selection', async () => {
    const logEntries = Array.from({ length: 40 }, (_, index) => ({
      line: `app line ${index + 1}`,
      runId: 1,
      sequence: index + 1,
      serviceId: 'app',
      stream: 'stdout' as const,
      timestamp: index + 1,
    }));
    const controller = new FakeController(
      createSnapshot({
        logsByServiceId: {
          api: [],
          app: logEntries,
        },
        managedServiceIds: ['app'],
        statuses: {
          app: 'running',
        },
      })
    );
    const { lastFrame, stdin } = render(
      <DevLauncherDashboardApp
        controller={controller}
        initialServiceIds={['app']}
        manifest={createManifest()}
        onExitCode={() => undefined}
      />
    );

    await flush();
    stdin.write('\u001B[B');
    await flush(6);
    stdin.write('\r');
    await flush(8);
    stdin.write('\u001B[A');
    await flush();
    stdin.write('\u001B');
    await flush(6);

    expect(lastFrame()).toContain('Dev dashboard');
    expect(lastFrame()).toContain('› App');
    expect(lastFrame()).toContain('App logs');
  });

  it('shows action availability in the dev tui and returns to startup on escape', async () => {
    const controller = new FakeController(createSnapshot());
    const listActions = vi.fn(
      async (): Promise<ResolvedDevAction[]> => [
        {
          available: true,
          id: 'install-deps',
          impactPolicy: 'stop-all',
          label: 'Install dependencies',
          reason: 'node_modules is stale.',
          suggestInDev: true,
        },
        {
          available: false,
          id: 'db-push',
          impactPolicy: 'parallel',
          label: 'Push database',
          reason: 'Database is current.',
          suggestInDev: false,
        },
      ]
    );
    const { lastFrame, stdin } = render(
      <DevLauncherDashboardApp
        controller={controller}
        listActions={listActions}
        manifest={createManifest()}
        onExitCode={() => undefined}
      />
    );

    await flush();
    stdin.write('x');
    await flush(4);

    expect(lastFrame()).toContain('Developer actions');
    expect(lastFrame()).toContain('Install dependencies [available]');
    expect(lastFrame()).toContain('Push database [unavailable]');

    stdin.write('\u001B');
    await flush(8);

    expect(lastFrame()).toContain('Start a dev session');
  });

  it('runs stop-all actions from the dev tui and restores managed services', async () => {
    const controller = new FakeController(
      createSnapshot({
        managedServiceIds: ['app'],
        statuses: {
          app: 'running',
        },
      })
    );
    const listActions = vi.fn(
      async (): Promise<ResolvedDevAction[]> => [
        {
          available: true,
          id: 'install-deps',
          impactPolicy: 'stop-all',
          label: 'Install dependencies',
          reason: 'node_modules is stale.',
          suggestInDev: true,
        },
      ]
    );
    const runDevAction = vi.fn(async () => ({
      action: {
        available: true,
        id: 'install-deps',
        impactPolicy: 'stop-all' as const,
        label: 'Install dependencies',
        suggestInDev: true,
      },
      forced: false,
      summary: 'Dependencies installed.',
    }));
    const { lastFrame, stdin } = render(
      <DevLauncherDashboardApp
        controller={controller}
        initialServiceIds={['app']}
        listActions={listActions}
        manifest={createManifest()}
        onExitCode={() => undefined}
        runDevAction={runDevAction}
      />
    );

    await flush();
    stdin.write('x');
    await flush(6);
    stdin.write('\r');
    await flush(6);

    expect(controller.stopAll).toHaveBeenCalledTimes(1);
    expect(controller.applyServiceSet).toHaveBeenCalledWith(['app']);
    expect(runDevAction).toHaveBeenCalledWith(createManifest(), 'install-deps');
    expect(lastFrame()).toContain('Dependencies installed.');
  });
});
