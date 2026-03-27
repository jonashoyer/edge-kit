import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  loadDevActionsConfig,
  resolveDevActionsConfigPath,
} from './actions-config';

const createTempDir = (): string => {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'edge-kit-dev-actions-'));
};

const writeFile = (filePath: string, content: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

const createValidConfigModule = (): string => {
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

describe('resolveDevActionsConfigPath', () => {
  it('finds dev-cli.config.ts by searching upward from cwd', () => {
    const tempDir = createTempDir();
    const nestedDir = path.join(tempDir, 'packages', 'app');
    writeFile(
      path.join(tempDir, 'dev-cli.config.ts'),
      createValidConfigModule()
    );

    const resolvedPath = resolveDevActionsConfigPath({
      cwd: nestedDir,
    });

    expect(resolvedPath).toBe(path.join(tempDir, 'dev-cli.config.ts'));
  });

  it('honors an explicit config override', () => {
    const tempDir = createTempDir();
    const nestedDir = path.join(tempDir, 'packages', 'app');
    const explicitPath = path.join(tempDir, 'config', 'custom.config.mjs');
    writeFile(explicitPath, createValidConfigModule());

    const resolvedPath = resolveDevActionsConfigPath({
      configPath: explicitPath,
      cwd: nestedDir,
    });

    expect(resolvedPath).toBe(explicitPath);
  });
});

describe('loadDevActionsConfig', () => {
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
      writeFile(path.join(tempDir, fileName), createValidConfigModule());

      const config = await loadDevActionsConfig({
        cwd: tempDir,
      });

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

    const config = await loadDevActionsConfig({
      cwd: tempDir,
    });

    expect(config.actionIdsInOrder).toEqual(['git-pull', 'install-deps']);
    expect(config.actionsById['git-pull']?.label).toBe('Pull latest commits');
    expect(config.actionsById['install-deps']?.label).toBe(
      'Install dependencies'
    );
  });

  it('rejects malformed default exports', async () => {
    const tempDir = createTempDir();
    writeFile(path.join(tempDir, 'dev-cli.config.ts'), 'export default 1;');

    await expect(
      loadDevActionsConfig({
        cwd: tempDir,
      })
    ).rejects.toThrow('default-export an object');
  });

  it('allows configs without any actions', async () => {
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
        kind: 'root-script',
        script: 'dev',
      },
    },
  },
  version: 1,
};
`
    );

    const config = await loadDevActionsConfig({
      cwd: tempDir,
    });

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

    await expect(
      loadDevActionsConfig({
        cwd: tempDir,
      })
    ).rejects.toThrow('must define a run function');
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

    await expect(
      loadDevActionsConfig({
        cwd: tempDir,
      })
    ).rejects.toThrow('must use a valid impactPolicy');
  });
});
