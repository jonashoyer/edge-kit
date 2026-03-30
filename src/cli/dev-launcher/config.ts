import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type {
  DevActionAvailabilityCheck,
  DevActionDefinition,
  DevActionImpactPolicy,
} from './actions';
import {
  getRepoRootFromConfigPath,
  resolveDevLauncherConfigPath,
} from './repo-utils';
import type { DevLauncherManifest, LoadedDevLauncherManifest } from './types';

const IMPACT_POLICIES = new Set<DevActionImpactPolicy>([
  'parallel',
  'stop-all',
  'stop-selected',
]);
const ACTION_HOTKEY_REGEXP = /^[a-z0-9]$/u;
const RESERVED_ACTION_HOTKEYS = new Set(['a', 'j', 'k', 'o', 'q', 'r', 's', 'x']);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isSupportedOpenUrl = (value: string): boolean => {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
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

const resolveOptionalActionHotkey = (
  value: unknown,
  actionId: string
): string | undefined => {
  const hotkey = resolveOptionalString(value, 'hotkey', actionId);
  if (!hotkey) {
    return undefined;
  }

  if (!ACTION_HOTKEY_REGEXP.test(hotkey)) {
    throw new Error(
      `Action "${actionId}" must set hotkey to a single lowercase letter or digit when provided.`
    );
  }

  if (RESERVED_ACTION_HOTKEYS.has(hotkey)) {
    throw new Error(
      `Action "${actionId}" cannot use reserved hotkey "${hotkey}".`
    );
  }

  return hotkey;
};

const validateDevActionDefinition = (
  actionId: string,
  value: unknown,
  index: number
): DevActionDefinition => {
  if (!isRecord(value)) {
    throw new Error(
      `Action "${actionId}" at index ${index} must be an object.`
    );
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
    hotkey: resolveOptionalActionHotkey(value.hotkey, actionId),
    impactPolicy: impactPolicy as DevActionImpactPolicy,
    isAvailable: value.isAvailable as DevActionAvailabilityCheck | undefined,
    label,
    run: value.run as DevActionDefinition['run'],
    suggestInDev: value.suggestInDev,
  };
};

const validateActionsById = (
  value: unknown
): {
  actionIdsInOrder: string[];
  actionsById: Record<string, DevActionDefinition>;
} => {
  if (value === undefined) {
    return {
      actionIdsInOrder: [],
      actionsById: {},
    };
  }

  if (!isRecord(value)) {
    throw new Error(
      'Dev config must set actionsById to an object when provided.'
    );
  }

  const actionIdsInOrder = Object.keys(value);
  const actionsById: Record<string, DevActionDefinition> = {};
  const hotkeyOwners = new Map<string, string>();

  for (const [index, actionId] of actionIdsInOrder.entries()) {
    if (actionId.trim().length === 0) {
      throw new Error('Action ids must be non-empty strings.');
    }

    const actionDefinition = validateDevActionDefinition(
      actionId,
      value[actionId],
      index
    );
    const hotkey = actionDefinition.hotkey;
    if (hotkey) {
      const existingOwner = hotkeyOwners.get(hotkey);
      if (existingOwner) {
        throw new Error(
          `Actions "${existingOwner}" and "${actionId}" cannot share hotkey "${hotkey}".`
        );
      }

      hotkeyOwners.set(hotkey, actionId);
    }

    actionsById[actionId] = actionDefinition;
  }

  return {
    actionIdsInOrder,
    actionsById,
  };
};

const serviceTargetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('root-script'),
    script: z.string().trim().min(1),
  }),
  z
    .object({
      kind: z.literal('workspace-script'),
      packageName: z.string().trim().min(1).optional(),
      packagePath: z.string().trim().min(1).optional(),
      script: z.string().trim().min(1),
    })
    .superRefine((value, context) => {
      const locatorCount =
        Number(value.packageName !== undefined) +
        Number(value.packagePath !== undefined);

      if (locatorCount !== 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'workspace-script targets must set exactly one of packageName or packagePath.',
          path: ['packageName'],
        });
      }
    }),
  z.object({
    args: z.array(z.string().min(1)).optional(),
    command: z.string().trim().min(1),
    cwd: z.string().trim().min(1).optional(),
    kind: z.literal('command'),
  }),
]);

const serviceSchema = z.object({
  description: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1),
  openUrl: z
    .string()
    .trim()
    .refine(isSupportedOpenUrl, {
      message: 'openUrl must be an absolute http:// or https:// URL.',
    })
    .optional(),
  target: serviceTargetSchema,
});

const manifestSchema = z
  .object({
    actionsById: z.record(z.string().trim().min(1), z.unknown()).optional(),
    packageManager: z.literal('pnpm'),
    servicesById: z.record(z.string().trim().min(1), serviceSchema),
    ui: z
      .object({
        logBufferLines: z.number().int().min(10).max(10_000).optional(),
      })
      .optional(),
    version: z.literal(1),
  })
  .superRefine((value, context) => {
    if (Object.keys(value.servicesById).length > 0) {
      return;
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one service must be declared.',
      path: ['servicesById'],
    });
  });

/**
 * Defines a typed TS config for long-running services plus one-shot developer
 * actions.
 */
export const defineDevLauncherConfig = (
  config: DevLauncherManifest
): DevLauncherManifest => config;

/**
 * Loads and validates the shared TS/JS dev-launcher config.
 */
export const loadDevLauncherConfig = async (options?: {
  configPath?: string;
  cwd?: string;
}): Promise<LoadedDevLauncherManifest> => {
  const configPath = resolveDevLauncherConfigPath(options);
  const moduleUrl = `${pathToFileURL(configPath).href}?t=${Date.now()}`;

  let importedModule: unknown;
  try {
    importedModule = await import(moduleUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load dev config "${configPath}": ${message}`);
  }

  const moduleRecord = importedModule as { default?: unknown };
  if (!isRecord(moduleRecord.default)) {
    throw new Error(
      'Dev config must default-export an object created by defineDevLauncherConfig({ ... }).'
    );
  }

  const manifest = manifestSchema.parse(moduleRecord.default);
  const repoRoot = getRepoRootFromConfigPath(configPath);
  const validatedActions = validateActionsById(
    moduleRecord.default.actionsById
  );

  return {
    ...manifest,
    ...validatedActions,
    configPath: path.resolve(configPath),
    repoRoot,
    serviceIdsInOrder: Object.keys(manifest.servicesById),
  };
};
