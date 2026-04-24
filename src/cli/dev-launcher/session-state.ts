import fs from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  type DevLauncherStatePathRuntime,
  defaultDevLauncherStatePathRuntime,
  getDevLauncherRepoHash,
  getDevLauncherStateRoot,
} from './state-paths';
import type {
  DevLauncherSessionMetadata,
  LoadedDevLauncherManifest,
} from './types';

interface PersistedSessionMetadata extends DevLauncherSessionMetadata {}

export interface DevLauncherSessionStateRuntime
  extends DevLauncherStatePathRuntime {
  connectSocket: (socketPath: string) => Promise<boolean>;
  processId: number;
  statSync: typeof fs.statSync;
  unlinkSync: typeof fs.unlinkSync;
  writeFileSync: typeof fs.writeFileSync;
  mkdirSync: typeof fs.mkdirSync;
  readFileSync: typeof fs.readFileSync;
  existsSync: typeof fs.existsSync;
  kill: (pid: number, signal: NodeJS.Signals | number) => boolean;
}

const probeSocket = async (socketPath: string): Promise<boolean> => {
  return await new Promise((resolve) => {
    const socket = net.createConnection(socketPath);

    const finish = (connected: boolean): void => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(connected);
    };

    socket.once('connect', () => {
      finish(true);
    });
    socket.once('error', () => {
      finish(false);
    });
  });
};

export const defaultDevLauncherSessionStateRuntime: DevLauncherSessionStateRuntime =
  {
    ...defaultDevLauncherStatePathRuntime,
    connectSocket: probeSocket,
    existsSync: fs.existsSync,
    kill: (pid, signal) => process.kill(pid, signal),
    mkdirSync: fs.mkdirSync,
    processId: process.pid,
    readFileSync: fs.readFileSync,
    statSync: fs.statSync,
    unlinkSync: fs.unlinkSync,
    writeFileSync: fs.writeFileSync,
  };

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const parseSessionMetadata = (
  value: unknown
): DevLauncherSessionMetadata | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (
    value.version !== 1 ||
    (value.mode !== 'foreground' && value.mode !== 'headless') ||
    typeof value.pid !== 'number' ||
    typeof value.repoRoot !== 'string' ||
    typeof value.sessionId !== 'string' ||
    typeof value.socketPath !== 'string' ||
    typeof value.startedAt !== 'number'
  ) {
    return null;
  }

  return {
    mode: value.mode,
    pid: value.pid,
    repoRoot: value.repoRoot,
    sessionId: value.sessionId,
    socketPath: value.socketPath,
    startedAt: value.startedAt,
    version: 1,
  };
};

const isProcessAlive = (
  pid: number,
  runtime: DevLauncherSessionStateRuntime
): boolean => {
  try {
    runtime.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export const resolveDevLauncherSessionMetadataPath = (
  manifest: Pick<LoadedDevLauncherManifest, 'repoRoot'>,
  runtime: DevLauncherStatePathRuntime = defaultDevLauncherStatePathRuntime
): string => {
  const repoHash = getDevLauncherRepoHash(manifest.repoRoot);
  return path.join(
    getDevLauncherStateRoot(runtime),
    'dev-launcher',
    `${repoHash}.session.json`
  );
};

export const resolveDevLauncherSocketPath = (
  manifest: Pick<LoadedDevLauncherManifest, 'repoRoot'>
): string => {
  const repoHash = getDevLauncherRepoHash(manifest.repoRoot);
  return path.join(tmpdir(), `edge-kit-dev-launcher-${repoHash}.sock`);
};

export const readDevLauncherSessionMetadata = (
  manifest: Pick<LoadedDevLauncherManifest, 'repoRoot'>,
  runtime: DevLauncherSessionStateRuntime = defaultDevLauncherSessionStateRuntime
): DevLauncherSessionMetadata | null => {
  const metadataPath = resolveDevLauncherSessionMetadataPath(manifest, runtime);
  if (!runtime.existsSync(metadataPath)) {
    return null;
  }

  try {
    return parseSessionMetadata(
      JSON.parse(runtime.readFileSync(metadataPath, 'utf-8'))
    );
  } catch {
    return null;
  }
};

export const writeDevLauncherSessionMetadata = (
  manifest: Pick<LoadedDevLauncherManifest, 'repoRoot'>,
  metadata: PersistedSessionMetadata,
  runtime: DevLauncherSessionStateRuntime = defaultDevLauncherSessionStateRuntime
): void => {
  const metadataPath = resolveDevLauncherSessionMetadataPath(manifest, runtime);
  runtime.mkdirSync(path.dirname(metadataPath), { recursive: true });
  runtime.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
};

export const cleanupDevLauncherSessionArtifacts = (
  manifest: Pick<LoadedDevLauncherManifest, 'repoRoot'>,
  runtime: DevLauncherSessionStateRuntime = defaultDevLauncherSessionStateRuntime
): void => {
  const metadataPath = resolveDevLauncherSessionMetadataPath(manifest, runtime);
  const socketPath = resolveDevLauncherSocketPath(manifest);

  for (const filePath of [metadataPath, socketPath]) {
    if (!runtime.existsSync(filePath)) {
      continue;
    }

    try {
      runtime.unlinkSync(filePath);
    } catch {
      // Best-effort cleanup of user-local session state.
    }
  }
};

export const resolveReachableDevLauncherSession = async (
  manifest: Pick<LoadedDevLauncherManifest, 'repoRoot'>,
  runtime: DevLauncherSessionStateRuntime = defaultDevLauncherSessionStateRuntime
): Promise<DevLauncherSessionMetadata | null> => {
  const metadata = readDevLauncherSessionMetadata(manifest, runtime);
  if (!metadata) {
    cleanupDevLauncherSessionArtifacts(manifest, runtime);
    return null;
  }

  if (metadata.repoRoot !== manifest.repoRoot) {
    cleanupDevLauncherSessionArtifacts(manifest, runtime);
    return null;
  }

  if (!isProcessAlive(metadata.pid, runtime)) {
    cleanupDevLauncherSessionArtifacts(manifest, runtime);
    return null;
  }

  const socketReachable = await runtime.connectSocket(metadata.socketPath);
  if (!socketReachable) {
    cleanupDevLauncherSessionArtifacts(manifest, runtime);
    return null;
  }

  return metadata;
};
