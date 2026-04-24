import type { LoadedDevLauncherManifest } from './types';

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
