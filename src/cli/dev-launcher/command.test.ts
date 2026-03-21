import { describe, expect, it, vi } from 'vitest';
import type { DevActionSuggestion } from './action-runner';
import type { LoadedDevActionsConfig } from './actions-config';
import { resolveInitialServiceIds, runDevLauncherCommand } from './command';
import type { LoadedDevLauncherManifest } from './types';

const createManifest = (): LoadedDevLauncherManifest => ({
  configPath: '/repo/dev-cli.config.json',
  packageManager: 'pnpm',
  presetIdsInOrder: ['default'],
  presetsById: {
    default: {
      label: 'Default',
      serviceIds: ['app', 'api'],
    },
  },
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

const createActionsConfig = (): LoadedDevActionsConfig => ({
  actionIdsInOrder: ['install-deps'],
  actionsById: {
    'install-deps': {
      impactPolicy: 'stop-all',
      label: 'Install dependencies',
      run: async () => {},
      suggestInDev: true,
    },
  },
  configPath: '/repo/dev-cli.actions.ts',
});

const createRuntime = (overrides?: {
  actionsConfig?: LoadedDevActionsConfig | null;
  interactive?: boolean;
  preflightSuggestions?: DevActionSuggestion[];
}) => {
  const stdout = {
    write: vi.fn(),
  } as unknown as NodeJS.WriteStream;
  const runPlainDevSession = vi.fn(async () => 0);
  const startDevLauncherTuiSession = vi.fn(async () => 0);

  return {
    runPlainDevSession,
    runtime: {
      getPreflightSuggestions: vi.fn(async () => {
        return overrides?.preflightSuggestions ?? [];
      }),
      isInteractiveTuiSupported: () => overrides?.interactive ?? true,
      loadActionsConfig: vi.fn(async () => overrides?.actionsConfig ?? null),
      loadManifest: () => createManifest(),
      runPlainDevSession,
      startDevLauncherTuiSession,
      stderr: process.stderr,
      stdout,
    },
    startDevLauncherTuiSession,
    stdout,
  };
};

describe('runDevLauncherCommand', () => {
  it('resolves preset and explicit service selections', () => {
    const manifest = createManifest();

    expect(resolveInitialServiceIds(manifest, { preset: 'default' })).toEqual([
      'app',
      'api',
    ]);
    expect(resolveInitialServiceIds(manifest, { services: 'api,app' })).toEqual(
      ['app', 'api']
    );
  });

  it('uses plain mode when --no-tui is provided', async () => {
    const { runPlainDevSession, runtime, startDevLauncherTuiSession } =
      createRuntime();

    await runDevLauncherCommand({ noTui: true }, runtime);

    expect(runPlainDevSession).toHaveBeenCalledTimes(1);
    expect(startDevLauncherTuiSession).not.toHaveBeenCalled();
  });

  it('falls back to plain mode when no interactive TTY is available', async () => {
    const { runPlainDevSession, runtime, startDevLauncherTuiSession, stdout } =
      createRuntime({
        interactive: false,
      });

    await runDevLauncherCommand({}, runtime);

    expect(runPlainDevSession).toHaveBeenCalledTimes(1);
    expect(startDevLauncherTuiSession).not.toHaveBeenCalled();
    expect(stdout.write).toHaveBeenCalledWith(
      'Interactive TTY not available. Falling back to plain mode.\n'
    );
  });

  it('passes preset and explicit service selections through to the selected runner', async () => {
    const { runPlainDevSession, runtime, startDevLauncherTuiSession } =
      createRuntime();

    await runDevLauncherCommand({ preset: 'default' }, runtime);
    await runDevLauncherCommand({ noTui: true, services: 'api' }, runtime);

    expect(startDevLauncherTuiSession).toHaveBeenCalledWith(createManifest(), [
      'app',
      'api',
    ]);
    expect(runPlainDevSession).toHaveBeenLastCalledWith(createManifest(), [
      'api',
    ]);
  });

  it('prints preflight suggestions from opted-in actions before starting dev', async () => {
    const { runtime, stdout } = createRuntime({
      actionsConfig: createActionsConfig(),
      preflightSuggestions: [
        {
          action: {
            available: true,
            id: 'install-deps',
            impactPolicy: 'stop-all',
            label: 'Install dependencies',
            suggestInDev: true,
          },
          message:
            'Action available before starting services: install-deps - run pnpm cli action run install-deps',
        },
      ],
    });

    await runDevLauncherCommand({ noTui: true }, runtime);

    expect(runtime.getPreflightSuggestions).toHaveBeenCalledTimes(1);
    expect(stdout.write).toHaveBeenCalledWith(
      'Action available before starting services: install-deps - run pnpm cli action run install-deps\n'
    );
  });
});
