import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getPresetServiceIds,
  loadDevLauncherManifest,
  normalizeSelectedServiceIds,
} from './manifest';

const createTempDir = (): string => {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'edge-kit-dev-launcher-'));
};

const writeJsonFile = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

const createBaseManifest = () => ({
  packageManager: 'pnpm' as const,
  presets: [
    {
      id: 'default',
      label: 'Default',
      serviceIds: ['app'],
    },
  ],
  services: [
    {
      id: 'app',
      label: 'App',
      target: {
        kind: 'root-script' as const,
        script: 'dev',
      },
    },
  ],
  version: 1 as const,
});

describe('loadDevLauncherManifest', () => {
  it('throws when no config file can be found', () => {
    const tempDir = createTempDir();

    expect(() => loadDevLauncherManifest({ cwd: tempDir })).toThrow(
      'Could not find dev-cli.config.json'
    );
  });

  it('throws for invalid schema values', () => {
    const tempDir = createTempDir();
    writeJsonFile(path.join(tempDir, 'dev-cli.config.json'), {
      ...createBaseManifest(),
      services: [
        {
          id: 'app',
          label: 'App',
          target: {
            kind: 'workspace-script',
            script: 'dev',
          },
        },
      ],
    });

    expect(() => loadDevLauncherManifest({ cwd: tempDir })).toThrow(
      'workspace-script targets must set exactly one of packageName or packagePath'
    );
  });

  it('throws for duplicate service ids', () => {
    const tempDir = createTempDir();
    writeJsonFile(path.join(tempDir, 'dev-cli.config.json'), {
      ...createBaseManifest(),
      services: [
        createBaseManifest().services[0],
        createBaseManifest().services[0],
      ],
    });

    try {
      loadDevLauncherManifest({ cwd: tempDir });
      throw new Error('Expected manifest loading to fail.');
    } catch (error) {
      expect(String(error)).toContain('Duplicate service id');
      expect(String(error)).toContain('\\"app\\"');
    }
  });

  it('throws when a preset references an unknown service id', () => {
    const tempDir = createTempDir();
    writeJsonFile(path.join(tempDir, 'dev-cli.config.json'), {
      ...createBaseManifest(),
      presets: [
        {
          id: 'default',
          label: 'Default',
          serviceIds: ['api'],
        },
      ],
    });

    try {
      loadDevLauncherManifest({ cwd: tempDir });
      throw new Error('Expected manifest loading to fail.');
    } catch (error) {
      expect(String(error)).toContain('references unknown service');
      expect(String(error)).toContain('\\"default\\"');
      expect(String(error)).toContain('\\"api\\"');
    }
  });

  it('loads valid root-script, workspace-script, and command services', () => {
    const tempDir = createTempDir();
    writeJsonFile(path.join(tempDir, 'dev-cli.config.json'), {
      packageManager: 'pnpm',
      presets: [
        {
          id: 'web',
          label: 'Web',
          serviceIds: ['app', 'api'],
        },
      ],
      services: [
        {
          id: 'app',
          label: 'App',
          target: {
            kind: 'root-script',
            script: 'dev',
          },
        },
        {
          id: 'api',
          label: 'API',
          target: {
            kind: 'workspace-script',
            packageName: '@repo/api',
            script: 'dev',
          },
        },
        {
          id: 'docs',
          label: 'Docs',
          target: {
            kind: 'workspace-script',
            packagePath: 'packages/docs',
            script: 'dev',
          },
        },
        {
          id: 'proxy',
          label: 'Proxy',
          target: {
            args: ['serve'],
            command: 'ngrok',
            cwd: 'tooling/proxy',
            kind: 'command',
          },
        },
      ],
      version: 1,
    });

    const manifest = loadDevLauncherManifest({ cwd: tempDir });

    expect(manifest.serviceIdsInOrder).toEqual(['app', 'api', 'docs', 'proxy']);
    expect(getPresetServiceIds(manifest, 'web')).toEqual(['app', 'api']);
    expect(
      normalizeSelectedServiceIds(manifest, ['proxy', 'app', 'proxy'])
    ).toEqual(['app', 'proxy']);
  });
});
