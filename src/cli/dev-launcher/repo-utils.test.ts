import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  listWorkspacePackageDirectories,
  resolveDevLauncherConfigPath,
  resolveWorkspacePackageDirectoryByName,
  resolveWorkspacePackageDirectoryByPath,
} from './repo-utils';

const createTempDir = (): string => {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'edge-kit-dev-repo-'));
};

const writeJsonFile = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

describe('repo utils', () => {
  it('finds the manifest from a nested directory in a single-package repo', () => {
    const tempDir = createTempDir();
    const nestedDir = path.join(tempDir, 'src', 'nested');

    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'dev-cli.config.ts'),
      'export default {};'
    );

    expect(resolveDevLauncherConfigPath({ cwd: nestedDir })).toBe(
      path.join(tempDir, 'dev-cli.config.ts')
    );
  });

  it('lists workspace package directories from pnpm-workspace patterns', () => {
    const tempDir = createTempDir();

    fs.writeFileSync(
      path.join(tempDir, 'pnpm-workspace.yaml'),
      [
        'packages:',
        '  - "apps/*"',
        '  - "packages/*"',
        '  - "!apps/skip"',
      ].join('\n')
    );
    writeJsonFile(path.join(tempDir, 'apps', 'web', 'package.json'), {
      name: '@repo/web',
    });
    writeJsonFile(path.join(tempDir, 'apps', 'skip', 'package.json'), {
      name: '@repo/skip',
    });
    writeJsonFile(path.join(tempDir, 'packages', 'api', 'package.json'), {
      name: '@repo/api',
    });
    writeJsonFile(path.join(tempDir, 'tools', 'misc', 'package.json'), {
      name: '@repo/misc',
    });

    expect(listWorkspacePackageDirectories(tempDir)).toEqual([
      path.join(tempDir, 'apps', 'web'),
      path.join(tempDir, 'packages', 'api'),
    ]);
  });

  it('resolves workspace packages by name and explicit path', () => {
    const tempDir = createTempDir();

    writeJsonFile(path.join(tempDir, 'package.json'), {
      name: '@repo/root',
    });
    fs.writeFileSync(
      path.join(tempDir, 'pnpm-workspace.yaml'),
      ['packages:', '  - "apps/*"', '  - "packages/*"'].join('\n')
    );
    writeJsonFile(path.join(tempDir, 'apps', 'web', 'package.json'), {
      name: '@repo/web',
    });
    writeJsonFile(path.join(tempDir, 'packages', 'api', 'package.json'), {
      name: '@repo/api',
    });

    expect(resolveWorkspacePackageDirectoryByName(tempDir, '@repo/api')).toBe(
      path.join(tempDir, 'packages', 'api')
    );
    expect(resolveWorkspacePackageDirectoryByPath(tempDir, 'apps/web')).toBe(
      path.join(tempDir, 'apps', 'web')
    );
    expect(resolveWorkspacePackageDirectoryByName(tempDir, '@repo/root')).toBe(
      tempDir
    );
  });
});
