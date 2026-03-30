import { encode } from '@toon-format/toon';
import { describe, expect, it, vi } from 'vitest';
import {
  runDevActionListCommand,
  runDevActionRunCommand,
} from './action-command';
import type {
  DevActionRunExecutionResult,
  DevActionRunnerRuntime,
  ResolvedDevAction,
} from './action-runner';
import type { LoadedDevLauncherManifest } from './types';

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

const createActionRuntime = (): DevActionRunnerRuntime => ({
  cwd: '/repo',
  env: process.env,
  platform: 'darwin',
  spawn: vi.fn(),
  stderr: process.stderr,
  stdout: process.stdout,
});

const createRuntime = (overrides?: {
  actions?: ResolvedDevAction[];
  runActionError?: Error;
  runActionResult?: DevActionRunExecutionResult;
}) => {
  const stdout = {
    write: vi.fn(),
  } as unknown as NodeJS.WriteStream;
  const runtime = {
    actionRuntime: createActionRuntime(),
    listActions: vi.fn(async () => overrides?.actions ?? []),
    loadManifest: vi.fn(async () => createManifest()),
    runAction: vi.fn(async () => {
      if (overrides?.runActionError) {
        throw overrides.runActionError;
      }

      return (
        overrides?.runActionResult ?? {
          action: {
            available: true,
            id: 'install-deps',
            impactPolicy: 'stop-all',
            label: 'Install dependencies',
            suggestInDev: true,
          },
          forced: false,
          summary: 'Dependencies installed.',
        }
      );
    }),
    stderr: process.stderr,
    stdout,
  };

  return {
    runtime,
    stdout,
  };
};

describe('runDevActionListCommand', () => {
  it('prints action availability and reasons', async () => {
    const { runtime, stdout } = createRuntime({
      actions: [
        {
          available: true,
          hotkey: 'i',
          id: 'install-deps',
          impactPolicy: 'stop-all',
          label: 'Install dependencies',
          reason: 'node_modules/.modules.yaml is missing.',
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
      ],
    });

    await runDevActionListCommand({}, runtime);

    expect(stdout.write).toHaveBeenNthCalledWith(
      1,
      'available install-deps [i] (Install dependencies) - node_modules/.modules.yaml is missing.\n'
    );
    expect(stdout.write).toHaveBeenNthCalledWith(
      2,
      'unavailable db-push (Push database) - Database is already current.\n'
    );
  });

  it('emits TOON output when requested', async () => {
    const { runtime, stdout } = createRuntime({
      actions: [
        {
          available: true,
          description: 'Install stale dependencies.',
          hotkey: 'i',
          id: 'install-deps',
          impactPolicy: 'stop-all',
          label: 'Install dependencies',
          reason: 'node_modules/.modules.yaml is missing.',
          suggestInDev: true,
        },
      ],
    });

    await runDevActionListCommand({ toon: true }, runtime);

    expect(stdout.write).toHaveBeenCalledWith(
      `${encode({
        actions: [
          {
            available: true,
            description: 'Install stale dependencies.',
            hotkey: 'i',
            id: 'install-deps',
            impactPolicy: 'stop-all',
            label: 'Install dependencies',
            reason: 'node_modules/.modules.yaml is missing.',
            suggestInDev: true,
          },
        ],
      })}\n`
    );
  });
});

describe('runDevActionRunCommand', () => {
  it('prints hook-provided summary output', async () => {
    const { runtime, stdout } = createRuntime();

    await runDevActionRunCommand('install-deps', {}, runtime);

    expect(stdout.write).toHaveBeenCalledWith('Dependencies installed.\n');
    expect(runtime.runAction).toHaveBeenCalledTimes(1);
    expect(runtime.runAction.mock.calls[0]?.[0]).toMatchObject({
      configPath: '/repo/dev-cli.config.ts',
      serviceIdsInOrder: ['app'],
    });
    expect(runtime.runAction.mock.calls[0]?.[1]).toMatchObject({
      actionIdsInOrder: ['install-deps'],
      configPath: '/repo/dev-cli.config.ts',
    });
    expect(runtime.runAction.mock.calls[0]?.[2]).toBe('install-deps');
    expect(runtime.runAction.mock.calls[0]?.[3]).toEqual({
      force: undefined,
      runtime: runtime.actionRuntime,
    });
  });

  it('passes --force through to the action runner', async () => {
    const { runtime } = createRuntime();

    await runDevActionRunCommand('install-deps', { force: true }, runtime);

    expect(runtime.runAction).toHaveBeenCalledTimes(1);
    expect(runtime.runAction.mock.calls[0]?.[0]).toMatchObject({
      configPath: '/repo/dev-cli.config.ts',
      serviceIdsInOrder: ['app'],
    });
    expect(runtime.runAction.mock.calls[0]?.[1]).toMatchObject({
      actionIdsInOrder: ['install-deps'],
      configPath: '/repo/dev-cli.config.ts',
    });
    expect(runtime.runAction.mock.calls[0]?.[2]).toBe('install-deps');
    expect(runtime.runAction.mock.calls[0]?.[3]).toEqual({
      force: true,
      runtime: runtime.actionRuntime,
    });
  });

  it('surfaces unknown action failures clearly', async () => {
    const { runtime } = createRuntime({
      runActionError: new Error('Unknown dev action "missing".'),
    });

    await expect(
      runDevActionRunCommand('missing', {}, runtime)
    ).rejects.toThrow('Unknown dev action "missing".');
  });
});
