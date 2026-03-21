import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getPnpmInstallState } from './package-state';

const createTempDir = (): string => {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'edge-kit-package-state-'));
};

const writeFile = (filePath: string, content: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

const setFileMtime = (filePath: string, timeMs: number): void => {
  const date = new Date(timeMs);
  fs.utimesSync(filePath, date, date);
};

describe('getPnpmInstallState', () => {
  it('reports install needed when the install marker is missing', () => {
    const tempDir = createTempDir();
    writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'repo' })
    );

    const state = getPnpmInstallState(tempDir);

    expect(state.needsInstall).toBe(true);
    expect(state.reason).toContain('node_modules/.modules.yaml is missing');
  });

  it('reports install needed when package inputs are newer than the install marker', () => {
    const tempDir = createTempDir();
    const packageJsonPath = path.join(tempDir, 'package.json');
    const lockfilePath = path.join(tempDir, 'pnpm-lock.yaml');
    const installMarkerPath = path.join(
      tempDir,
      'node_modules',
      '.modules.yaml'
    );
    writeFile(packageJsonPath, JSON.stringify({ name: 'repo' }));
    writeFile(lockfilePath, 'lockfileVersion: 9');
    writeFile(installMarkerPath, 'storeDir: /tmp/store');

    setFileMtime(installMarkerPath, 1000);
    setFileMtime(packageJsonPath, 2000);
    setFileMtime(lockfilePath, 3000);

    const state = getPnpmInstallState(tempDir);

    expect(state.needsInstall).toBe(true);
    expect(state.reason).toContain('pnpm-lock.yaml is newer');
  });

  it('reports dependencies current when the install marker is up to date', () => {
    const tempDir = createTempDir();
    const packageJsonPath = path.join(tempDir, 'package.json');
    const workspacePackageJsonPath = path.join(
      tempDir,
      'packages',
      'app',
      'package.json'
    );
    const workspaceConfigPath = path.join(tempDir, 'pnpm-workspace.yaml');
    const installMarkerPath = path.join(
      tempDir,
      'node_modules',
      '.modules.yaml'
    );
    writeFile(packageJsonPath, JSON.stringify({ name: 'repo' }));
    writeFile(workspacePackageJsonPath, JSON.stringify({ name: '@repo/app' }));
    writeFile(workspaceConfigPath, 'packages:\n  - packages/*\n');
    writeFile(installMarkerPath, 'storeDir: /tmp/store');

    setFileMtime(packageJsonPath, 1000);
    setFileMtime(workspacePackageJsonPath, 2000);
    setFileMtime(workspaceConfigPath, 2500);
    setFileMtime(installMarkerPath, 3000);

    const state = getPnpmInstallState(tempDir);

    expect(state.needsInstall).toBe(false);
    expect(state.reason).toBe('Dependencies look current.');
  });
});
