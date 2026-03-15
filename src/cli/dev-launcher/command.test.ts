import { describe, expect, it, vi } from 'vitest';
import { resolveInitialServiceIds, runDevLauncherCommand } from './command';
import type { LoadedDevLauncherManifest } from './types';

const createManifest = (): LoadedDevLauncherManifest => ({
  configPath: '/repo/dev-cli.config.json',
  packageManager: 'pnpm',
  presets: [
    {
      id: 'default',
      label: 'Default',
      serviceIds: ['app', 'api'],
    },
  ],
  presetsById: {
    default: {
      id: 'default',
      label: 'Default',
      serviceIds: ['app', 'api'],
    },
  },
  repoRoot: '/repo',
  serviceIdsInOrder: ['app', 'api'],
  services: [
    {
      id: 'app',
      label: 'App',
      target: {
        kind: 'root-script',
        script: 'dev:app',
      },
    },
    {
      id: 'api',
      label: 'API',
      target: {
        kind: 'root-script',
        script: 'dev:api',
      },
    },
  ],
  servicesById: {
    api: {
      id: 'api',
      label: 'API',
      target: {
        kind: 'root-script',
        script: 'dev:api',
      },
    },
    app: {
      id: 'app',
      label: 'App',
      target: {
        kind: 'root-script',
        script: 'dev:app',
      },
    },
  },
  version: 1,
});

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
    const runPlainDevSession = vi.fn(async () => 0);
    const startDevLauncherTuiSession = vi.fn(async () => 0);

    await runDevLauncherCommand(
      { noTui: true },
      {
        isInteractiveTuiSupported: () => true,
        loadManifest: () => createManifest(),
        runPlainDevSession,
        startDevLauncherTuiSession,
        stderr: process.stderr,
        stdout: process.stdout,
      }
    );

    expect(runPlainDevSession).toHaveBeenCalledTimes(1);
    expect(startDevLauncherTuiSession).not.toHaveBeenCalled();
  });

  it('falls back to plain mode when no interactive TTY is available', async () => {
    const stdout = {
      write: vi.fn(),
    } as unknown as NodeJS.WriteStream;
    const runPlainDevSession = vi.fn(async () => 0);
    const startDevLauncherTuiSession = vi.fn(async () => 0);

    await runDevLauncherCommand(
      {},
      {
        isInteractiveTuiSupported: () => false,
        loadManifest: () => createManifest(),
        runPlainDevSession,
        startDevLauncherTuiSession,
        stderr: process.stderr,
        stdout,
      }
    );

    expect(runPlainDevSession).toHaveBeenCalledTimes(1);
    expect(startDevLauncherTuiSession).not.toHaveBeenCalled();
    expect(stdout.write).toHaveBeenCalledWith(
      'Interactive TTY not available. Falling back to plain mode.\n'
    );
  });

  it('passes preset and explicit service selections through to the selected runner', async () => {
    const runPlainDevSession = vi.fn(async () => 0);
    const startDevLauncherTuiSession = vi.fn(async () => 0);

    await runDevLauncherCommand(
      { preset: 'default' },
      {
        isInteractiveTuiSupported: () => true,
        loadManifest: () => createManifest(),
        runPlainDevSession,
        startDevLauncherTuiSession,
        stderr: process.stderr,
        stdout: process.stdout,
      }
    );
    await runDevLauncherCommand(
      { noTui: true, services: 'api' },
      {
        isInteractiveTuiSupported: () => true,
        loadManifest: () => createManifest(),
        runPlainDevSession,
        startDevLauncherTuiSession,
        stderr: process.stderr,
        stdout: process.stdout,
      }
    );

    expect(startDevLauncherTuiSession).toHaveBeenCalledWith(createManifest(), [
      'app',
      'api',
    ]);
    expect(runPlainDevSession).toHaveBeenLastCalledWith(createManifest(), [
      'api',
    ]);
  });
});
