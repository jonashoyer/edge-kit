import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupDevLauncherSessionArtifacts,
  readDevLauncherSessionMetadata,
  resolveDevLauncherSessionMetadataPath,
  resolveDevLauncherSocketPath,
  resolveReachableDevLauncherSession,
  writeDevLauncherSessionMetadata,
} from './session-state';
import type { LoadedDevLauncherManifest } from './types';

const tempDirectories: string[] = [];

const createManifest = (repoRoot = '/repo'): LoadedDevLauncherManifest => ({
  actionIdsInOrder: [],
  actionsById: {},
  configPath: `${repoRoot}/dev-cli.config.ts`,
  packageManager: 'pnpm',
  repoRoot,
  serviceIdsInOrder: ['app'],
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

const createRuntime = (stateRoot: string) => ({
  connectSocket: async () => false,
  env: {
    EDGE_KIT_DEV_LAUNCHER_STATE_DIR: stateRoot,
  },
  existsSync: fs.existsSync,
  homedir: () => os.homedir(),
  kill: () => {
    throw new Error('dead');
  },
  mkdirSync: fs.mkdirSync,
  platform: 'darwin' as const,
  processId: 123,
  readFileSync: fs.readFileSync,
  statSync: fs.statSync,
  unlinkSync: fs.unlinkSync,
  writeFileSync: fs.writeFileSync,
});

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, {
      force: true,
      recursive: true,
    });
  }
});

describe('session-state', () => {
  it('derives deterministic metadata and socket paths from the repo root', () => {
    const manifest = createManifest('/repo-one');
    const stateRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'edge-kit-session-state-')
    );
    tempDirectories.push(stateRoot);
    const runtime = createRuntime(stateRoot);

    const metadataPath = resolveDevLauncherSessionMetadataPath(
      manifest,
      runtime
    );
    const socketPath = resolveDevLauncherSocketPath(manifest);

    expect(metadataPath).toContain('/dev-launcher/');
    expect(metadataPath).toMatch(/\.session\.json$/u);
    expect(resolveDevLauncherSocketPath(manifest)).toBe(socketPath);
    expect(socketPath.length).toBeLessThan(100);
  });

  it('cleans up stale metadata and socket files when the session is unreachable', async () => {
    const stateRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'edge-kit-session-state-')
    );
    tempDirectories.push(stateRoot);
    const manifest = createManifest('/repo-two');
    const runtime = createRuntime(stateRoot);
    const metadata = {
      mode: 'foreground' as const,
      pid: 999,
      repoRoot: manifest.repoRoot,
      sessionId: 'session-1',
      socketPath: resolveDevLauncherSocketPath(manifest),
      startedAt: 1,
      version: 1 as const,
    };

    writeDevLauncherSessionMetadata(manifest, metadata, runtime);
    fs.writeFileSync(metadata.socketPath, '');

    expect(readDevLauncherSessionMetadata(manifest, runtime)).toEqual(metadata);
    expect(
      await resolveReachableDevLauncherSession(manifest, runtime)
    ).toBeNull();
    expect(
      fs.existsSync(resolveDevLauncherSessionMetadataPath(manifest, runtime))
    ).toBe(false);
    expect(fs.existsSync(metadata.socketPath)).toBe(false);

    cleanupDevLauncherSessionArtifacts(manifest, runtime);
  });
});
