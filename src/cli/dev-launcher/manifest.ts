import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  getRepoRootFromConfigPath,
  resolveDevLauncherConfigPath,
} from './repo-utils';
import type { DevLauncherManifest, LoadedDevLauncherManifest } from './types';

const isSupportedOpenUrl = (value: string): boolean => {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
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

const presetSchema = z.object({
  description: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1),
  serviceIds: z.array(z.string().trim().min(1)).min(1),
});

const manifestSchema = z
  .object({
    packageManager: z.literal('pnpm'),
    presetsById: z.record(z.string().trim().min(1), presetSchema),
    servicesById: z.record(z.string().trim().min(1), serviceSchema),
    ui: z
      .object({
        logBufferLines: z.number().int().min(10).max(10_000).optional(),
      })
      .optional(),
    version: z.literal(1),
  })
  .superRefine((value, context) => {
    const serviceIds = Object.keys(value.servicesById);

    if (serviceIds.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one service must be declared.',
        path: ['servicesById'],
      });
    }

    const serviceIdSet = new Set(serviceIds);
    for (const [presetId, preset] of Object.entries(value.presetsById)) {
      for (const serviceId of preset.serviceIds) {
        if (!serviceIdSet.has(serviceId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Preset "${presetId}" references unknown service "${serviceId}".`,
            path: ['presetsById', presetId, 'serviceIds'],
          });
        }
      }
    }
  });

/**
 * Normalizes a requested service selection against the manifest's declared
 * service order.
 */
export const normalizeSelectedServiceIds = (
  manifest: LoadedDevLauncherManifest,
  serviceIds: Iterable<string>
): string[] => {
  const requestedServiceIds = new Set(serviceIds);

  for (const serviceId of requestedServiceIds) {
    if (!manifest.servicesById[serviceId]) {
      throw new Error(`Unknown dev service "${serviceId}".`);
    }
  }

  return manifest.serviceIdsInOrder.filter((serviceId) => {
    return requestedServiceIds.has(serviceId);
  });
};

/**
 * Returns the service ids for a manifest preset using manifest order.
 */
export const getPresetServiceIds = (
  manifest: LoadedDevLauncherManifest,
  presetId: string
): string[] => {
  const preset = manifest.presetsById[presetId];
  if (!preset) {
    throw new Error(`Unknown dev preset "${presetId}".`);
  }

  return normalizeSelectedServiceIds(manifest, preset.serviceIds);
};

/**
 * Loads and validates a dev-launcher manifest from the default lookup path or
 * an explicitly provided config path.
 */
export const loadDevLauncherManifest = (options?: {
  configPath?: string;
  cwd?: string;
}): LoadedDevLauncherManifest => {
  const configPath = resolveDevLauncherConfigPath(options);
  const content = fs.readFileSync(configPath, 'utf-8');
  const parsedContent = JSON.parse(content) as DevLauncherManifest;
  const manifest = manifestSchema.parse(parsedContent);
  const repoRoot = getRepoRootFromConfigPath(configPath);

  return {
    ...manifest,
    configPath: path.resolve(configPath),
    presetIdsInOrder: Object.keys(manifest.presetsById),
    repoRoot,
    serviceIdsInOrder: Object.keys(manifest.servicesById),
  };
};
