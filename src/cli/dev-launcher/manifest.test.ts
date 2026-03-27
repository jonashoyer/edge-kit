import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadDevLauncherManifest,
  normalizeSelectedServiceIds,
} from './manifest';

const createTempDir = (): string => {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'edge-kit-dev-launcher-'));
};

const writeFile = (filePath: string, content: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

const createBaseConfig = (): string => {
  return `
export default {
  packageManager: 'pnpm',
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
};
`;
};

describe('loadDevLauncherManifest', () => {
  it('throws when no config file can be found', async () => {
    const tempDir = createTempDir();

    await expect(loadDevLauncherManifest({ cwd: tempDir })).rejects.toThrow(
      'Could not find a dev-cli.config.ts/.mts/.js/.mjs file'
    );
  });

  it('throws for invalid schema values', async () => {
    const tempDir = createTempDir();
    writeFile(
      path.join(tempDir, 'dev-cli.config.ts'),
      `
export default {
  packageManager: 'pnpm',
  servicesById: {
    app: {
      label: 'App',
      target: {
        kind: 'workspace-script',
        script: 'dev',
      },
    },
  },
  version: 1,
};
`
    );

    await expect(loadDevLauncherManifest({ cwd: tempDir })).rejects.toThrow(
      'workspace-script targets must set exactly one of packageName or packagePath'
    );
  });

  it('throws when no services are declared', async () => {
    const tempDir = createTempDir();
    writeFile(
      path.join(tempDir, 'dev-cli.config.ts'),
      `
export default {
  packageManager: 'pnpm',
  servicesById: {},
  version: 1,
};
`
    );

    await expect(loadDevLauncherManifest({ cwd: tempDir })).rejects.toThrow(
      'At least one service must be declared.'
    );
  });

  it('loads valid root-script, workspace-script, and command services plus actions', async () => {
    const tempDir = createTempDir();
    writeFile(
      path.join(tempDir, 'dev-cli.config.ts'),
      `
export default {
  actionsById: {
    'install-deps': {
      label: 'Install dependencies',
      impactPolicy: 'stop-all',
      async run() {
        return { summary: 'ok' };
      },
    },
  },
  packageManager: 'pnpm',
  servicesById: {
    app: {
      label: 'App',
      openUrl: 'http://localhost:3000',
      target: {
        kind: 'root-script',
        script: 'dev',
      },
    },
    api: {
      label: 'API',
      target: {
        kind: 'workspace-script',
        packageName: '@repo/api',
        script: 'dev',
      },
    },
    docs: {
      label: 'Docs',
      target: {
        kind: 'workspace-script',
        packagePath: 'packages/docs',
        script: 'dev',
      },
    },
    proxy: {
      label: 'Proxy',
      target: {
        args: ['serve'],
        command: 'ngrok',
        cwd: 'tooling/proxy',
        kind: 'command',
      },
    },
  },
  version: 1,
};
`
    );

    const manifest = await loadDevLauncherManifest({ cwd: tempDir });

    expect(manifest.actionIdsInOrder).toEqual(['install-deps']);
    expect(manifest.serviceIdsInOrder).toEqual(['app', 'api', 'docs', 'proxy']);
    expect(manifest.servicesById.app?.openUrl).toBe('http://localhost:3000');
    expect(
      normalizeSelectedServiceIds(manifest, ['proxy', 'app', 'proxy'])
    ).toEqual(['app', 'proxy']);
  });

  it('throws for invalid openUrl values', async () => {
    const tempDir = createTempDir();
    writeFile(
      path.join(tempDir, 'dev-cli.config.ts'),
      `
export default {
  packageManager: 'pnpm',
  servicesById: {
    app: {
      label: 'App',
      openUrl: 'localhost:3000',
      target: {
        kind: 'root-script',
        script: 'dev',
      },
    },
  },
  version: 1,
};
`
    );

    await expect(loadDevLauncherManifest({ cwd: tempDir })).rejects.toThrow(
      'openUrl must be an absolute http:// or https:// URL.'
    );
  });

  it('rejects malformed action definitions', async () => {
    const tempDir = createTempDir();
    writeFile(
      path.join(tempDir, 'dev-cli.config.ts'),
      `
${createBaseConfig()}
`
    );
    writeFile(
      path.join(tempDir, 'broken.config.ts'),
      `
export default {
  actionsById: {
    broken: {
      label: 'Broken',
      impactPolicy: 'parallel',
    },
  },
  packageManager: 'pnpm',
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
};
`
    );

    await expect(
      loadDevLauncherManifest({
        configPath: path.join(tempDir, 'broken.config.ts'),
        cwd: tempDir,
      })
    ).rejects.toThrow('Action "broken" must define a run function');
  });
});
