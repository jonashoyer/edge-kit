import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadRecentDevServiceSelections,
  resolveDevLauncherSelectionHistoryPath,
  saveRecentDevServiceSelection,
} from './selection-history';
import type { LoadedDevLauncherManifest } from './types';

const createTempDir = (): string => {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'edge-kit-dev-history-'));
};

const createManifest = (): LoadedDevLauncherManifest => ({
  actionIdsInOrder: [],
  actionsById: {},
  configPath: '/repo/dev-cli.config.ts',
  packageManager: 'pnpm',
  repoRoot: '/repo',
  serviceIdsInOrder: ['app', 'api', 'worker'],
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
    worker: {
      label: 'Worker',
      target: {
        kind: 'root-script',
        script: 'dev:worker',
      },
    },
  },
  version: 1,
});

const createRuntime = (stateRoot: string) => ({
  env: {
    EDGE_KIT_DEV_LAUNCHER_STATE_DIR: stateRoot,
  } as NodeJS.ProcessEnv,
  homedir: () => stateRoot,
  platform: 'darwin' as const,
});

describe('selection history', () => {
  it('stores latest selections first and deduplicates them', () => {
    const manifest = createManifest();
    const stateRoot = createTempDir();
    const runtime = createRuntime(stateRoot);

    saveRecentDevServiceSelection(manifest, ['app', 'api'], runtime);
    saveRecentDevServiceSelection(manifest, ['worker'], runtime);
    saveRecentDevServiceSelection(manifest, ['api', 'app'], runtime);

    expect(loadRecentDevServiceSelections(manifest, runtime)).toEqual([
      ['app', 'api'],
      ['worker'],
    ]);
  });

  it('ignores unreadable or stale selections in the persisted file', () => {
    const manifest = createManifest();
    const stateRoot = createTempDir();
    const runtime = createRuntime(stateRoot);
    const historyPath = resolveDevLauncherSelectionHistoryPath(
      manifest,
      runtime
    );

    fs.mkdirSync(path.dirname(historyPath), { recursive: true });
    fs.writeFileSync(
      historyPath,
      JSON.stringify({
        recentSelections: [['missing'], ['worker', 'missing'], ['api']],
        repoRoot: manifest.repoRoot,
        version: 1,
      })
    );

    expect(loadRecentDevServiceSelections(manifest, runtime)).toEqual([
      ['worker'],
      ['api'],
    ]);
  });
});
