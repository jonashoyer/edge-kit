import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { DevLauncherProcessManager } from './process-manager';
import type { LoadedDevLauncherManifest } from './types';

class FakeReadable extends EventEmitter {
  emitData(chunk: string): void {
    this.emit('data', chunk);
  }
}

class FakeChildProcess extends EventEmitter {
  readonly stderr = new FakeReadable();
  readonly stdout = new FakeReadable();
  readonly kills: Array<NodeJS.Signals | number | undefined> = [];
  readonly pid: number;

  constructor(pid: number) {
    super();
    this.pid = pid;
  }

  kill(signal?: NodeJS.Signals | number): boolean {
    this.kills.push(signal);
    this.emit('exit', 0, null);
    return true;
  }

  fail(code = 1): void {
    this.emit('exit', code, null);
  }
}

const createManifest = (): LoadedDevLauncherManifest => ({
  configPath: '/repo/dev-cli.config.json',
  packageManager: 'pnpm',
  presetIdsInOrder: [],
  presetsById: {},
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

describe('DevLauncherProcessManager', () => {
  it('applies a service set and starts one child per selected service', async () => {
    const children: FakeChildProcess[] = [];
    const manager = new DevLauncherProcessManager(
      createManifest(),
      {
        clearTimeout,
        env: process.env,
        now: () => 1,
        platform: 'darwin',
        setTimeout,
        spawn: () => {
          const child = new FakeChildProcess(children.length + 1);
          children.push(child);
          return child;
        },
      },
      {
        logBufferSize: 10,
      }
    );

    await manager.applyServiceSet(['app', 'api']);

    expect(children).toHaveLength(2);
    expect(manager.getSnapshot().managedServiceIds).toEqual(['app', 'api']);
    expect(manager.getSnapshot().serviceStates.app.status).toBe('running');
    expect(manager.getSnapshot().allLogs.at(-1)?.line).toBe('started');
  });

  it('adds and removes services without restarting unchanged services', async () => {
    const children: FakeChildProcess[] = [];
    const manager = new DevLauncherProcessManager(createManifest(), {
      clearTimeout,
      env: process.env,
      now: () => Date.now(),
      platform: 'darwin',
      setTimeout,
      spawn: () => {
        const child = new FakeChildProcess(children.length + 1);
        children.push(child);
        return child;
      },
    });

    await manager.applyServiceSet(['app']);
    const firstRunId = manager.getSnapshot().serviceStates.app.runId;

    await manager.applyServiceSet(['app', 'api']);

    expect(manager.getSnapshot().serviceStates.app.runId).toBe(firstRunId);
    expect(manager.getSnapshot().serviceStates.api.status).toBe('running');

    await manager.applyServiceSet(['api']);

    expect(manager.getSnapshot().serviceStates.app.status).toBe('stopped');
    expect(manager.getSnapshot().serviceStates.api.runId).toBe(1);
  });

  it('records lifecycle logs for stop and restart actions', async () => {
    const children: FakeChildProcess[] = [];
    const manager = new DevLauncherProcessManager(createManifest(), {
      clearTimeout,
      env: process.env,
      now: () => Date.now(),
      platform: 'darwin',
      setTimeout,
      spawn: () => {
        const child = new FakeChildProcess(children.length + 1);
        children.push(child);
        return child;
      },
    });

    await manager.applyServiceSet(['app']);
    await manager.restartService('app');

    const systemLines = manager
      .getSnapshot()
      .logsByServiceId.app.filter((entry) => entry.stream === 'system')
      .map((entry) => entry.line);

    expect(systemLines).toContain('stopping');
    expect(systemLines).toContain('stopped');
    expect(systemLines).toContain('restarted');
  });

  it('marks unexpected exits as failed', async () => {
    const children: FakeChildProcess[] = [];
    const manager = new DevLauncherProcessManager(createManifest(), {
      clearTimeout,
      env: process.env,
      now: () => Date.now(),
      platform: 'darwin',
      setTimeout,
      spawn: () => {
        const child = new FakeChildProcess(children.length + 1);
        children.push(child);
        return child;
      },
    });

    await manager.applyServiceSet(['app']);
    children[0]?.fail(2);

    expect(manager.getSnapshot().serviceStates.app.status).toBe('failed');
    expect(manager.getSnapshot().allLogs.at(-1)?.line).toBe('failed (code 2)');
  });

  it('keeps only a bounded log buffer per service', async () => {
    const children: FakeChildProcess[] = [];
    const manager = new DevLauncherProcessManager(
      createManifest(),
      {
        clearTimeout,
        env: process.env,
        now: () => Date.now(),
        platform: 'darwin',
        setTimeout,
        spawn: () => {
          const child = new FakeChildProcess(children.length + 1);
          children.push(child);
          return child;
        },
      },
      {
        logBufferSize: 2,
      }
    );

    await manager.applyServiceSet(['app']);
    children[0]?.stdout.emitData('one\ntwo\nthree\n');

    expect(
      manager.getSnapshot().logsByServiceId.app.map((entry) => entry.line)
    ).toEqual(['two', 'three']);
  });
});
