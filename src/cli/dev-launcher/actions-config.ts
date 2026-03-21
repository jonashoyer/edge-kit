import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  DevActionAvailabilityCheck,
  DevActionDefinition,
  DevActionImpactPolicy,
} from './actions';

const ACTIONS_CONFIG_FILE_NAMES = [
  'dev-cli.actions.ts',
  'dev-cli.actions.mts',
  'dev-cli.actions.js',
  'dev-cli.actions.mjs',
] as const;
const IMPACT_POLICIES = new Set<DevActionImpactPolicy>([
  'parallel',
  'stop-all',
  'stop-selected',
]);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const resolveOptionalString = (
  value: unknown,
  fieldName: string,
  actionId: string
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      `Action "${actionId}" must set ${fieldName} to a non-empty string when provided.`
    );
  }

  return value;
};

const validateDevActionDefinition = (
  actionId: string,
  value: unknown,
  index: number
): DevActionDefinition => {
  if (!isRecord(value)) {
    throw new Error(`Action "${actionId}" at index ${index} must be an object.`);
  }

  const label = value.label;
  if (typeof label !== 'string' || label.trim().length === 0) {
    throw new Error(`Action "${actionId}" must define a non-empty label.`);
  }

  const impactPolicy = value.impactPolicy;
  if (
    typeof impactPolicy !== 'string' ||
    !IMPACT_POLICIES.has(impactPolicy as DevActionImpactPolicy)
  ) {
    throw new Error(
      `Action "${actionId}" must use a valid impactPolicy: parallel, stop-selected, or stop-all.`
    );
  }

  if (
    value.suggestInDev !== undefined &&
    typeof value.suggestInDev !== 'boolean'
  ) {
    throw new Error(`Action "${actionId}" must set suggestInDev to a boolean.`);
  }

  if (
    value.isAvailable !== undefined &&
    typeof value.isAvailable !== 'function'
  ) {
    throw new Error(`Action "${actionId}" must set isAvailable to a function.`);
  }

  if (typeof value.run !== 'function') {
    throw new Error(`Action "${actionId}" must define a run function.`);
  }

  return {
    description: resolveOptionalString(
      value.description,
      'description',
      actionId
    ),
    impactPolicy: impactPolicy as DevActionImpactPolicy,
    isAvailable: value.isAvailable as DevActionAvailabilityCheck | undefined,
    label,
    run: value.run as DevActionDefinition['run'],
    suggestInDev: value.suggestInDev,
  };
};

const validateActionsModule = (value: unknown): {
  actionIdsInOrder: string[];
  actionsById: Record<string, DevActionDefinition>;
} => {
  if (!isRecord(value)) {
    throw new Error(
      'Actions config must default-export an object created by defineDevActions({ actionsById: { ... } }).'
    );
  }

  const actionsValue = value.actionsById;
  if (!isRecord(actionsValue)) {
    throw new Error(
      'Actions config must default-export an object with an actionsById map.'
    );
  }

  const actionIdsInOrder = Object.keys(actionsValue);
  const actionsById: Record<string, DevActionDefinition> = {};

  if (actionIdsInOrder.length === 0) {
    throw new Error('Actions config must define at least one action.');
  }

  for (const [index, actionId] of actionIdsInOrder.entries()) {
    if (actionId.trim().length === 0) {
      throw new Error('Action ids must be non-empty strings.');
    }

    actionsById[actionId] = validateDevActionDefinition(
      actionId,
      actionsValue[actionId],
      index
    );
  }

  return {
    actionIdsInOrder,
    actionsById,
  };
};

export interface LoadedDevActionsConfig {
  actionIdsInOrder: string[];
  actionsById: Record<string, DevActionDefinition>;
  configPath: string;
}

/**
 * Resolves the actions registry path from an explicit override or by searching
 * upward from the current working directory.
 */
export const resolveDevActionsConfigPath = (options?: {
  actionsConfigPath?: string;
  cwd?: string;
  optional?: boolean;
}): string | null => {
  const cwd = path.resolve(options?.cwd ?? process.cwd());
  const explicitConfigPath = options?.actionsConfigPath?.trim();

  if (explicitConfigPath) {
    const resolvedPath = path.resolve(cwd, explicitConfigPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(
        `Could not find actions config at ${resolvedPath}. Pass --actions-config with a valid path.`
      );
    }

    return resolvedPath;
  }

  let currentDir = cwd;
  while (true) {
    for (const fileName of ACTIONS_CONFIG_FILE_NAMES) {
      const candidatePath = path.join(currentDir, fileName);
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  if (options?.optional) {
    return null;
  }

  throw new Error(
    `Could not find a dev-cli.actions.ts/.mts/.js/.mjs file from ${cwd}. Pass --actions-config to specify it explicitly.`
  );
};

/**
 * Loads and validates the local TS/JS actions registry.
 */
export const loadDevActionsConfig = async (options?: {
  actionsConfigPath?: string;
  cwd?: string;
  optional?: boolean;
}): Promise<LoadedDevActionsConfig | null> => {
  const configPath = resolveDevActionsConfigPath(options);
  if (!configPath) {
    return null;
  }

  const moduleUrl = `${pathToFileURL(configPath).href}?t=${Date.now()}`;

  let importedModule: unknown;
  try {
    importedModule = await import(moduleUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load actions config "${configPath}": ${message}`
    );
  }

  const moduleRecord = importedModule as { default?: unknown };
  const validatedConfig = validateActionsModule(moduleRecord.default);

  return {
    actionIdsInOrder: validatedConfig.actionIdsInOrder,
    actionsById: validatedConfig.actionsById,
    configPath: path.resolve(configPath),
  };
};
