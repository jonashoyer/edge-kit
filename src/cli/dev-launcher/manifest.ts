import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  getRepoRootFromConfigPath,
  resolveDevLauncherConfigPath,
} from './repo-utils';
import type {
  DevLauncherManifest,
  DevLauncherPresetDefinition,
  DevLauncherServiceDefinition,
  LoadedDevLauncherManifest,
} from './types';

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
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  target: serviceTargetSchema,
});

const presetSchema = z.object({
  description: z.string().trim().min(1).optional(),
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  serviceIds: z.array(z.string().trim().min(1)).min(1),
});

const manifestSchema = z
  .object({
    packageManager: z.literal('pnpm'),
    presets: z.array(presetSchema),
    services: z.array(serviceSchema).min(1),
    ui: z
      .object({
        logBufferLines: z.number().int().min(10).max(10_000).optional(),
      })
      .optional(),
    version: z.literal(1),
  })
  .superRefine((value, context) => {
    const serviceIds = new Set<string>();
    for (const [index, service] of value.services.entries()) {
      if (serviceIds.has(service.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate service id "${service.id}".`,
          path: ['services', index, 'id'],
        });
        continue;
      }

      serviceIds.add(service.id);
    }

    const presetIds = new Set<string>();
    for (const [index, preset] of value.presets.entries()) {
      if (presetIds.has(preset.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate preset id "${preset.id}".`,
          path: ['presets', index, 'id'],
        });
        continue;
      }

      presetIds.add(preset.id);

      for (const serviceId of preset.serviceIds) {
        if (!serviceIds.has(serviceId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Preset "${preset.id}" references unknown service "${serviceId}".`,
            path: ['presets', index, 'serviceIds'],
          });
        }
      }
    }
  });

const buildIndexedRecord = <T extends { id: string }>(
  items: T[]
): Record<string, T> => {
  return Object.fromEntries(
    items.map((item) => [item.id, item] as const)
  ) as Record<string, T>;
};

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
    presetsById: buildIndexedRecord<DevLauncherPresetDefinition>(
      manifest.presets
    ),
    repoRoot,
    serviceIdsInOrder: manifest.services.map((service) => service.id),
    servicesById: buildIndexedRecord<DevLauncherServiceDefinition>(
      manifest.services
    ),
  };
};
