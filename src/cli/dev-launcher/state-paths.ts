import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export interface DevLauncherStatePathRuntime {
  env: NodeJS.ProcessEnv;
  homedir: () => string;
  platform: NodeJS.Platform;
}

export const defaultDevLauncherStatePathRuntime: DevLauncherStatePathRuntime = {
  env: process.env,
  homedir: () => os.homedir(),
  platform: process.platform,
};

export const getDevLauncherStateRoot = (
  runtime: DevLauncherStatePathRuntime = defaultDevLauncherStatePathRuntime
): string => {
  const explicitStateRoot = runtime.env.EDGE_KIT_DEV_LAUNCHER_STATE_DIR;
  if (explicitStateRoot && explicitStateRoot.trim().length > 0) {
    return explicitStateRoot;
  }

  if (runtime.platform === 'darwin') {
    return path.join(
      runtime.homedir(),
      'Library',
      'Application Support',
      'edge-kit'
    );
  }

  if (runtime.platform === 'win32') {
    const appData = runtime.env.APPDATA;
    if (appData && appData.trim().length > 0) {
      return path.join(appData, 'edge-kit');
    }
  }

  const xdgStateHome = runtime.env.XDG_STATE_HOME;
  if (xdgStateHome && xdgStateHome.trim().length > 0) {
    return path.join(xdgStateHome, 'edge-kit');
  }

  return path.join(runtime.homedir(), '.local', 'state', 'edge-kit');
};

export const getDevLauncherRepoHash = (repoRoot: string): string => {
  return createHash('sha1')
    .update(path.resolve(repoRoot))
    .digest('hex')
    .slice(0, 12);
};
