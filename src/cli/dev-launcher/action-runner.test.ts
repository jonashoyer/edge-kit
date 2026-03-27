import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  getDevPreflightActionSuggestions,
  listDevActions,
  runDevAction,
} from './action-runner';
import type { DevActionDefinition } from './actions';
import type { LoadedDevActionsConfig } from './actions-config';
import type { LoadedDevLauncherManifest } from './types';

class FakeSpawnedProcess extends EventEmitter {
  readonly stderr: PassThrough | null;
  readonly stdout: PassThrough | null;

  constructor(stdio: 'inherit' | 'pipe') {
    super();
    this.stdout = stdio === 'pipe' ? new PassThrough() : null;
    this.stderr = stdio === 'pipe' ? new PassThrough() : null;
  }
}

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

const createActionsConfig = (
  actionsById: Record<string, DevActionDefinition>
): LoadedDevActionsConfig => ({
  actionIdsInOrder: Object.keys(actionsById),
  actionsById,
  configPath: '/repo/dev-cli.config.ts',
});

const createRuntime = (options?: {
  captureInheritedStdio?: boolean;
  onSpawn?: (input: {
    args: string[];
    command: string;
    cwd: string;
    stdio: 'inherit' | 'pipe';
  }) => {
    code?: number;
    stderr?: string;
    stdout?: string;
  };
}) => {
  const stderr = {
    write: vi.fn(),
  } as unknown as NodeJS.WriteStream;
  const stdout = {
    write: vi.fn(),
  } as unknown as NodeJS.WriteStream;
  const spawnCalls: Array<{
    args: string[];
    command: string;
    cwd: string;
    stdio: 'inherit' | 'pipe';
  }> = [];

  return {
    runtime: {
      captureInheritedStdio: options?.captureInheritedStdio,
      cwd: '/repo/packages/app',
      env: process.env,
      platform: 'darwin' as const,
      spawn: (
        command: string,
        args: string[],
        spawnOptions: {
          cwd: string;
          env: NodeJS.ProcessEnv;
          shell: false;
          stdio: 'inherit' | 'pipe';
        }
      ) => {
        const child = new FakeSpawnedProcess(spawnOptions.stdio);
        spawnCalls.push({
          args,
          command,
          cwd: spawnOptions.cwd,
          stdio: spawnOptions.stdio,
        });

        queueMicrotask(() => {
          const result = options?.onSpawn?.({
            args,
            command,
            cwd: spawnOptions.cwd,
            stdio: spawnOptions.stdio,
          }) ?? {
            code: 0,
            stdout: 'ok\n',
          };

          if (spawnOptions.stdio === 'pipe') {
            if (result.stdout) {
              child.stdout?.write(result.stdout);
            }
            if (result.stderr) {
              child.stderr?.write(result.stderr);
            }
            child.stdout?.end();
            child.stderr?.end();
          }

          child.emit('close', result.code ?? 0);
        });

        return child;
      },
      stderr,
      stdout,
    },
    spawnCalls,
    stderr,
    stdout,
  };
};

describe('listDevActions', () => {
  it('shows availability and reasons for configured actions', async () => {
    const manifest = createManifest();
    const config = createActionsConfig({
      'install-deps': {
        impactPolicy: 'stop-all',
        isAvailable: async () => ({
          available: true,
          reason: 'node_modules is missing.',
        }),
        label: 'Install dependencies',
        async run() {},
        suggestInDev: true,
      },
      'db-push': {
        impactPolicy: 'stop-selected',
        isAvailable: async () => ({
          available: false,
          reason: 'Database is already current.',
        }),
        label: 'Push database',
        async run() {},
      },
    });

    const actions = await listDevActions(
      manifest,
      config,
      createRuntime().runtime
    );

    expect(actions).toEqual([
      {
        available: true,
        id: 'install-deps',
        impactPolicy: 'stop-all',
        label: 'Install dependencies',
        reason: 'node_modules is missing.',
        suggestInDev: true,
      },
      {
        available: false,
        id: 'db-push',
        impactPolicy: 'stop-selected',
        label: 'Push database',
        reason: 'Database is already current.',
        suggestInDev: false,
      },
    ]);
  });

  it('rejects invalid availability return shapes', async () => {
    const manifest = createManifest();
    const config = createActionsConfig({
      broken: {
        impactPolicy: 'parallel',
        isAvailable: async () => ({ reason: 'missing available' }) as never,
        label: 'Broken',
        async run() {},
      },
    });

    await expect(
      listDevActions(manifest, config, createRuntime().runtime)
    ).rejects.toThrow('invalid availability result');
  });
});

describe('runDevAction', () => {
  it('executes an available action and exposes exec and pnpm helpers', async () => {
    const manifest = createManifest();
    const config = createActionsConfig({
      'install-deps': {
        impactPolicy: 'stop-all',
        isAvailable: async () => true,
        label: 'Install dependencies',
        async run(context) {
          const execResult = await context.exec('custom-tool', ['status']);
          await context.pnpm(['install'], {
            cwd: 'packages/app',
            stdio: 'inherit',
          });
          return {
            summary: execResult.stdout.trim(),
          };
        },
      },
    });
    const { runtime, spawnCalls } = createRuntime();

    const result = await runDevAction(manifest, config, 'install-deps', {
      runtime,
    });

    expect(result.summary).toBe('ok');
    expect(spawnCalls).toEqual([
      {
        args: ['status'],
        command: 'custom-tool',
        cwd: '/repo',
        stdio: 'pipe',
      },
      {
        args: ['install'],
        command: 'pnpm',
        cwd: '/repo/packages/app',
        stdio: 'inherit',
      },
    ]);
  });

  it('refuses unavailable actions unless forced', async () => {
    const manifest = createManifest();
    const config = createActionsConfig({
      'db-push': {
        impactPolicy: 'stop-selected',
        isAvailable: async () => ({
          available: false,
          reason: 'No schema changes detected.',
        }),
        label: 'Push database',
        async run() {},
      },
    });

    await expect(
      runDevAction(manifest, config, 'db-push', {
        runtime: createRuntime().runtime,
      })
    ).rejects.toThrow(
      'Action "db-push" is unavailable. No schema changes detected.'
    );
  });

  it('allows forced execution of unavailable actions', async () => {
    const manifest = createManifest();
    const config = createActionsConfig({
      'db-push': {
        impactPolicy: 'stop-selected',
        isAvailable: async () => ({
          available: false,
          reason: 'No schema changes detected.',
        }),
        label: 'Push database',
        async run() {
          return {
            summary: 'Forced run complete.',
          };
        },
      },
    });
    const { runtime, stderr } = createRuntime();

    const result = await runDevAction(manifest, config, 'db-push', {
      force: true,
      runtime,
    });

    expect(result.summary).toBe('Forced run complete.');
    expect(stderr.write).toHaveBeenCalledWith(
      'warn: Running unavailable action "db-push" because --force was provided.\n'
    );
  });

  it('captures inherited subprocess stdio when requested by the runtime', async () => {
    const manifest = createManifest();
    const config = createActionsConfig({
      'install-deps': {
        impactPolicy: 'stop-all',
        label: 'Install dependencies',
        async run(context) {
          await context.pnpm(['install'], {
            stdio: 'inherit',
          });
        },
      },
    });
    const { runtime, spawnCalls } = createRuntime({
      captureInheritedStdio: true,
    });

    await runDevAction(manifest, config, 'install-deps', {
      runtime,
    });

    expect(spawnCalls).toEqual([
      {
        args: ['install'],
        command: 'pnpm',
        cwd: '/repo',
        stdio: 'pipe',
      },
    ]);
  });

  it('surfaces thrown action errors clearly', async () => {
    const manifest = createManifest();
    const config = createActionsConfig({
      migrate: {
        impactPolicy: 'stop-all',
        label: 'Run migrations',
        async run() {
          throw new Error('migration failed');
        },
      },
    });

    await expect(
      runDevAction(manifest, config, 'migrate', {
        runtime: createRuntime().runtime,
      })
    ).rejects.toThrow('Action "migrate" failed: migration failed');
  });
});

describe('getDevPreflightActionSuggestions', () => {
  it('evaluates only actions with suggestInDev enabled and returns available suggestions', async () => {
    const manifest = createManifest();
    const checkedActionIds: string[] = [];
    const config = createActionsConfig({
      'install-deps': {
        impactPolicy: 'stop-all',
        isAvailable: async () => {
          checkedActionIds.push('install-deps');
          return {
            available: true,
            reason: 'pnpm-lock.yaml is newer than node_modules/.modules.yaml.',
          };
        },
        label: 'Install dependencies',
        async run() {},
        suggestInDev: true,
      },
      'db-push': {
        impactPolicy: 'stop-selected',
        isAvailable: async () => {
          checkedActionIds.push('db-push');
          return {
            available: false,
            reason: 'Database is already current.',
          };
        },
        label: 'Push database',
        async run() {},
        suggestInDev: true,
      },
      migrate: {
        impactPolicy: 'parallel',
        isAvailable: async () => {
          checkedActionIds.push('migrate');
          return true;
        },
        label: 'Run migrations',
        async run() {},
      },
    });

    const suggestions = await getDevPreflightActionSuggestions(
      manifest,
      config,
      createRuntime().runtime
    );

    expect(checkedActionIds).toEqual(['install-deps', 'db-push']);
    expect(suggestions).toEqual([
      {
        action: {
          available: true,
          id: 'install-deps',
          impactPolicy: 'stop-all',
          label: 'Install dependencies',
          reason: 'pnpm-lock.yaml is newer than node_modules/.modules.yaml.',
          suggestInDev: true,
        },
        message:
          'Action available before starting services: install-deps - run pnpm cli action run install-deps (pnpm-lock.yaml is newer than node_modules/.modules.yaml.)',
      },
    ]);
  });
});
