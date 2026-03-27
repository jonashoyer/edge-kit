import { loadDevLauncherConfig } from './config';
import { resolveDevLauncherConfigPath } from './repo-utils';
import type { LoadedDevLauncherManifest } from './types';

export interface LoadedDevActionsConfig {
  actionIdsInOrder: string[];
  actionsById: LoadedDevLauncherManifest['actionsById'];
  configPath: string;
}

/**
 * Resolves the shared dev config path from an explicit override or by
 * searching upward from the current working directory.
 */
export const resolveDevActionsConfigPath = resolveDevLauncherConfigPath;

/**
 * Loads the shared dev config and returns the action subset.
 */
export const loadDevActionsConfig = async (options?: {
  configPath?: string;
  cwd?: string;
}): Promise<LoadedDevActionsConfig> => {
  const config = await loadDevLauncherConfig(options);

  return {
    actionIdsInOrder: config.actionIdsInOrder,
    actionsById: config.actionsById ?? {},
    configPath: config.configPath,
  };
};
