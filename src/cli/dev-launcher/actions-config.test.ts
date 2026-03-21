import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

const createValidActionsModule = (): string => {
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
};
`;
};

describe('resolveDevActionsConfigPath', () => {
  it('finds dev-cli.actions.ts by searching upward from cwd', () => {
    const tempDir = createTempDir();
    const nestedDir = path.join(tempDir, 'packages', 'app');
    writeFile(
      path.join(tempDir, 'dev-cli.actions.ts'),
      createValidActionsModule()
    );

    const resolvedPath = resolveDevActionsConfigPath({
      cwd: nestedDir,
    });

    expect(resolvedPath).toBe(path.join(tempDir, 'dev-cli.actions.ts'));
  });

  it('honors an explicit actions config override', () => {
    const tempDir = createTempDir();
    const nestedDir = path.join(tempDir, 'packages', 'app');
    const explicitPath = path.join(tempDir, 'config', 'custom.actions.mjs');
    writeFile(explicitPath, createValidActionsModule());

    const resolvedPath = resolveDevActionsConfigPath({
      actionsConfigPath: explicitPath,
      cwd: nestedDir,
    });

    expect(resolvedPath).toBe(explicitPath);
  });
});

describe('loadDevActionsConfig', () => {
  it('supports .ts, .mts, .js, and .mjs actions config files', async () => {
    const extensions = [
      'dev-cli.actions.ts',
      'dev-cli.actions.mts',
      'dev-cli.actions.js',
      'dev-cli.actions.mjs',
    ];

    for (const fileName of extensions) {
      const tempDir = createTempDir();
      writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ type: 'module' }, null, 2)
      );
      writeFile(path.join(tempDir, fileName), createValidActionsModule());

      const config = await loadDevActionsConfig({
        cwd: tempDir,
      });

      expect(config?.actionIdsInOrder).toEqual(['install-deps']);
    }
  });

  it('rejects malformed default exports', async () => {
    const tempDir = createTempDir();
    writeFile(path.join(tempDir, 'dev-cli.actions.ts'), 'export default 1;');

    await expect(
      loadDevActionsConfig({
        cwd: tempDir,
      })
    ).rejects.toThrow('default-export an object');
  });

  it('rejects an empty actionsById map', async () => {
    const tempDir = createTempDir();
    writeFile(
      path.join(tempDir, 'dev-cli.actions.ts'),
      `
export default {
  actionsById: {},
};
`
    );

    await expect(
      loadDevActionsConfig({
        cwd: tempDir,
      })
    ).rejects.toThrow('must define at least one action');
  });

  it('rejects actions without a run function', async () => {
    const tempDir = createTempDir();
    writeFile(
      path.join(tempDir, 'dev-cli.actions.ts'),
      `
export default {
  actionsById: {
    a: { label: 'A', impactPolicy: 'parallel' },
  },
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
      path.join(tempDir, 'dev-cli.actions.ts'),
      `
export default {
  actionsById: {
    a: { label: 'A', impactPolicy: 'restart', async run() {} },
  },
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
