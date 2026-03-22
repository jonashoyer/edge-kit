import { describe, expect, it, vi } from 'vitest';
import type { DevActionContext, DevActionExecResult } from '../actions';
import type { LoadedDevLauncherManifest } from '../types';
import { gitPullAction } from './git-pull';

const createManifest = (): LoadedDevLauncherManifest => ({
  configPath: '/repo/dev-cli.config.json',
  packageManager: 'pnpm',
  presetIdsInOrder: [],
  presetsById: {},
  repoRoot: '/repo',
  serviceIdsInOrder: [],
  servicesById: {},
  version: 1,
});

const createExecResult = (overrides?: Partial<DevActionExecResult>) => ({
  args: [],
  command: 'git',
  cwd: '/repo',
  exitCode: 0,
  stderr: '',
  stdout: '',
  ...overrides,
});

const createContext = (responses: Record<string, DevActionExecResult>) => {
  const exec = vi.fn(
    async (
      command: string,
      args: string[] = [],
      _options?: {
        cwd?: string;
        env?: NodeJS.ProcessEnv;
        rejectOnNonZero?: boolean;
        stdio?: 'inherit' | 'pipe';
      }
    ) => {
      const key = [command, ...args].join(' ');
      const response = responses[key];

      if (!response) {
        throw new Error(`Missing exec response for "${key}".`);
      }

      return response;
    }
  );

  const context: DevActionContext = {
    actionsConfigPath: '/repo/dev-cli.actions.ts',
    configPath: '/repo/dev-cli.config.json',
    cwd: '/repo',
    exec,
    logger: {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
    manifest: createManifest(),
    output: {
      write: vi.fn(),
      writeLine: vi.fn(),
    },
    pnpm: vi.fn(),
    repoRoot: '/repo',
  };

  return {
    context,
    exec,
  };
};

describe('gitPullAction', () => {
  it('is available when the tracked branch is behind remote', async () => {
    const { context, exec } = createContext({
      'git branch --show-current': createExecResult({ stdout: 'main\n' }),
      'git fetch --quiet': createExecResult(),
      'git rev-list --left-right --count HEAD...origin/main': createExecResult({
        stdout: '0\t2\n',
      }),
      'git rev-parse --abbrev-ref --symbolic-full-name @{upstream}':
        createExecResult({
          stdout: 'origin/main\n',
        }),
    });

    const result = await gitPullAction.isAvailable?.(context);

    expect(result).toEqual({
      available: true,
      reason: 'origin/main is ahead of main by 2 commits.',
    });
    expect(exec).toHaveBeenCalledWith('git', ['fetch', '--quiet']);
  });

  it('reports unavailable when the tracked branch is already current', async () => {
    const { context } = createContext({
      'git branch --show-current': createExecResult({ stdout: 'main\n' }),
      'git fetch --quiet': createExecResult(),
      'git rev-list --left-right --count HEAD...origin/main': createExecResult({
        stdout: '0\t0\n',
      }),
      'git rev-parse --abbrev-ref --symbolic-full-name @{upstream}':
        createExecResult({
          stdout: 'origin/main\n',
        }),
    });

    const result = await gitPullAction.isAvailable?.(context);

    expect(result).toEqual({
      available: false,
      reason: 'main is already up to date with origin/main.',
    });
  });

  it('fast-forward pulls when the tracked branch is behind remote', async () => {
    const { context, exec } = createContext({
      'git branch --show-current': createExecResult({ stdout: 'main\n' }),
      'git fetch --quiet': createExecResult(),
      'git pull --ff-only': createExecResult(),
      'git rev-list --left-right --count HEAD...origin/main': createExecResult({
        stdout: '0\t3\n',
      }),
      'git rev-parse --abbrev-ref --symbolic-full-name @{upstream}':
        createExecResult({
          stdout: 'origin/main\n',
        }),
    });

    const result = await gitPullAction.run(context);

    expect(result).toEqual({
      summary: 'Pulled 3 commits from origin/main.',
    });
    expect(exec).toHaveBeenCalledWith(
      'git',
      ['pull', '--ff-only'],
      expect.objectContaining({
        stdio: 'inherit',
      })
    );
  });

  it('fails clearly when the branch has diverged from upstream', async () => {
    const { context } = createContext({
      'git branch --show-current': createExecResult({ stdout: 'main\n' }),
      'git fetch --quiet': createExecResult(),
      'git rev-list --left-right --count HEAD...origin/main': createExecResult({
        stdout: '2\t1\n',
      }),
      'git rev-parse --abbrev-ref --symbolic-full-name @{upstream}':
        createExecResult({
          stdout: 'origin/main\n',
        }),
    });

    await expect(gitPullAction.run(context)).rejects.toThrow(
      'main has diverged from origin/main (2 commits ahead, 1 commit behind). Resolve the branch state manually before pulling.'
    );
  });
});
