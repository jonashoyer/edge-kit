import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  loadDevActionsConfigSubset,
  loadDevLauncherConfig,
  loadDevLauncherManifest,
  resolveDevLauncherConfigPath,
} from './config';

const createTempDir = (): string => {
  return fs.mkdtempSync(
    path.join(os.tmpdir(), 'edge-kit-dev-launcher-config-')
  );
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

const createActionsConfig = (): string => {
  return `
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

describe('dev-launcher config loading boundary', () => {
  it('resolves config paths by searching upward or honoring explicit overrides', () => {
    const tempDir = createTempDir();
    const nestedDir = path.join(tempDir, 'packages', 'app');
    const explicitPath = path.join(tempDir, 'config', 'custom.config.mjs');
    writeFile(path.join(tempDir, 'dev-cli.config.ts'), createActionsConfig());
    writeFile(explicitPath, createActionsConfig());

    expect(resolveDevLauncherConfigPath({ cwd: nestedDir })).toBe(
      path.join(tempDir, 'dev-cli.config.ts')
    );
    expect(
      resolveDevLauncherConfigPath({
        configPath: explicitPath,
        cwd: nestedDir,
      })
    ).toBe(explicitPath);
  });

  it('supports .ts, .mts, .js, and .mjs config files', async () => {
    const extensions = [
      'dev-cli.config.ts',
      'dev-cli.config.mts',
      'dev-cli.config.js',
      'dev-cli.config.mjs',
    ];

    for (const fileName of extensions) {
      const tempDir = createTempDir();
      writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ type: 'module' }, null, 2)
      );
      writeFile(path.join(tempDir, fileName), createActionsConfig());

      const config = await loadDevLauncherConfig({ cwd: tempDir });

      expect(config.actionIdsInOrder).toEqual(['install-deps']);
    }
  });

  it('loads a config that imports concrete dev-launcher modules', async () => {
    const tempDir = createTempDir();
    const configModuleUrl = pathToFileURL(
      path.resolve(process.cwd(), 'src/cli/dev-launcher/config.ts')
    ).href;
    const gitPullActionUrl = pathToFileURL(
      path.resolve(process.cwd(), 'src/cli/dev-launcher/actions/git-pull.ts')
    ).href;
    const installDepsActionUrl = pathToFileURL(
      path.resolve(
        process.cwd(),
        'src/cli/dev-launcher/actions/install-deps.ts'
      )
    ).href;
    writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ type: 'module' }, null, 2)
    );
    writeFile(
      path.join(tempDir, 'dev-cli.config.ts'),
      `
import { defineDevLauncherConfig } from '${configModuleUrl}';
import { gitPullAction } from '${gitPullActionUrl}';
import { installDepsAction } from '${installDepsActionUrl}';

export default defineDevLauncherConfig({
  actionsById: {
    'git-pull': gitPullAction,
    'install-deps': installDepsAction,
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
});
`
    );

    const config = await loadDevActionsConfigSubset({ cwd: tempDir });

    expect(config.actionIdsInOrder).toEqual(['git-pull', 'install-deps']);
    expect(config.actionsById['git-pull']?.label).toBe('Pull latest commits');
    expect(config.actionsById['git-pull']?.hotkey).toBe('p');
    expect(config.actionsById['install-deps']?.label).toBe(
      'Install dependencies'
    );
    expect(config.actionsById['install-deps']?.hotkey).toBe('i');
  });

  it('rejects malformed default exports', async () => {
    const tempDir = createTempDir();
    writeFile(path.join(tempDir, 'dev-cli.config.ts'), 'export default 1;');

    await expect(loadDevLauncherConfig({ cwd: tempDir })).rejects.toThrow(
      'default-export an object'
    );
  });

  it('allows configs without any actions', async () => {
    const tempDir = createTempDir();
    writeFile(path.join(tempDir, 'dev-cli.config.ts'), createBaseConfig());

    const config = await loadDevActionsConfigSubset({ cwd: tempDir });

    expect(config.actionIdsInOrder).toEqual([]);
  });

  it('rejects actions without a run function', async () => {
    const tempDir = createTempDir();
    writeFile(
      path.join(tempDir, 'dev-cli.config.ts'),
      `
export default {
  actionsById: {
    a: { label: 'A', impactPolicy: 'parallel' },
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

    await expect(loadDevActionsConfigSubset({ cwd: tempDir })).rejects.toThrow(
      'must define a run function'
    );
  });

  it('rejects invalid impact policies', async () => {
    const tempDir = createTempDir();
    writeFile(
      path.join(tempDir, 'dev-cli.config.ts'),
      `
export default {
  actionsById: {
    a: { label: 'A', impactPolicy: 'restart', async run() {} },
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

    await expect(loadDevActionsConfigSubset({ cwd: tempDir })).rejects.toThrow(
      'must use a valid impactPolicy'
    );
  });

  it('rejects duplicate action hotkeys', async () => {
    const tempDir = createTempDir();
    writeFile(
      path.join(tempDir, 'dev-cli.config.ts'),
      `
export default {
  actionsById: {
    a: { label: 'A', hotkey: 'i', impactPolicy: 'parallel', async run() {} },
    b: { label: 'B', hotkey: 'i', impactPolicy: 'parallel', async run() {} },
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

    await expect(loadDevActionsConfigSubset({ cwd: tempDir })).rejects.toThrow(
      'cannot share hotkey "i"'
    );
  });

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
      hotkey: 'i',
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
    expect(manifest.actionsById['install-deps']?.hotkey).toBe('i');
    expect(manifest.serviceIdsInOrder).toEqual(['app', 'api', 'docs', 'proxy']);
    expect(manifest.servicesById.app?.openUrl).toBe('http://localhost:3000');
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
});
