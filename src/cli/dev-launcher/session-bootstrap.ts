import { spawn } from 'node:child_process';
import {
  type DevLauncherSessionStateRuntime,
  defaultDevLauncherSessionStateRuntime,
  resolveReachableDevLauncherSession,
} from './session-state';
import type { LoadedDevLauncherManifest } from './types';

const BOOTSTRAP_TIMEOUT_MS = 15_000;
const BOOTSTRAP_POLL_INTERVAL_MS = 250;

interface SpawnResultLike {
  on: (event: 'close' | 'error', listener: (...args: any[]) => void) => void;
}

export interface DevLauncherBootstrapRuntime
  extends DevLauncherSessionStateRuntime {
  platform: NodeJS.Platform;
  setTimeout: (callback: () => void, delay: number) => NodeJS.Timeout;
  spawn: (
    command: string,
    args: string[],
    options: { stdio: 'ignore' }
  ) => SpawnResultLike;
}

export const defaultDevLauncherBootstrapRuntime: DevLauncherBootstrapRuntime = {
  ...defaultDevLauncherSessionStateRuntime,
  platform: process.platform,
  setTimeout,
  spawn: (command, args, options) => spawn(command, args, options),
};

const shellQuote = (value: string): string => {
  return `'${value.split("'").join(`'\\''`)}'`;
};

const createBootstrapCommand = (
  manifest: LoadedDevLauncherManifest
): string => {
  return [
    `cd ${shellQuote(manifest.repoRoot)}`,
    `pnpm cli dev host --headless --config ${shellQuote(manifest.configPath)}`,
  ].join(' && ');
};

export const waitForReachableDevLauncherSession = async (
  manifest: LoadedDevLauncherManifest,
  runtime: DevLauncherBootstrapRuntime = defaultDevLauncherBootstrapRuntime,
  timeoutMs = BOOTSTRAP_TIMEOUT_MS
) => {
  const timeoutAt = Date.now() + timeoutMs;

  while (Date.now() < timeoutAt) {
    const metadata = await resolveReachableDevLauncherSession(
      manifest,
      runtime
    );
    if (metadata) {
      return metadata;
    }

    await new Promise<void>((resolve) => {
      runtime.setTimeout(resolve, BOOTSTRAP_POLL_INTERVAL_MS);
    });
  }

  return null;
};

export const bootstrapDevLauncherSessionInTerminal = async (
  manifest: LoadedDevLauncherManifest,
  runtime: DevLauncherBootstrapRuntime = defaultDevLauncherBootstrapRuntime
) => {
  if (runtime.platform !== 'darwin') {
    throw new Error('Terminal bootstrap is only supported on macOS.');
  }

  const terminalCommand = createBootstrapCommand(manifest);
  const appleScript = [
    'tell application "Terminal"',
    'activate',
    `do script ${JSON.stringify(terminalCommand)}`,
    'end tell',
  ].join('\n');

  await new Promise<void>((resolve, reject) => {
    const child = runtime.spawn('osascript', ['-e', appleScript], {
      stdio: 'ignore',
    });

    child.on('close', (code: number) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`osascript exited with code ${code}.`));
    });
    child.on('error', reject);
  });

  const metadata = await waitForReachableDevLauncherSession(manifest, runtime);
  if (!metadata) {
    throw new Error('Timed out waiting for the dev launcher session to start.');
  }

  return metadata;
};
