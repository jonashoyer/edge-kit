import fs from 'node:fs';
import path from 'node:path';
import {
  type DevLauncherStatePathRuntime,
  defaultDevLauncherStatePathRuntime,
  getDevLauncherRepoHash,
  getDevLauncherStateRoot,
} from './state-paths';
import type { LoadedDevLauncherManifest } from './types';

const MAX_RECENT_SELECTIONS = 6;

interface PersistedSelectionHistory {
  recentSelections: string[][];
  repoRoot: string;
  version: 1;
}

type SelectionHistoryRuntime = DevLauncherStatePathRuntime;

const defaultRuntime = defaultDevLauncherStatePathRuntime;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const normalizeSelection = (
  manifest: LoadedDevLauncherManifest,
  serviceIds: Iterable<string>
): string[] => {
  const requestedServiceIds = new Set(serviceIds);
  return manifest.serviceIdsInOrder.filter((serviceId) => {
    return requestedServiceIds.has(serviceId);
  });
};

const dedupeSelections = (selections: string[][]): string[][] => {
  const seen = new Set<string>();
  const dedupedSelections: string[][] = [];

  for (const selection of selections) {
    if (selection.length === 0) {
      continue;
    }

    const selectionKey = JSON.stringify(selection);
    if (seen.has(selectionKey)) {
      continue;
    }

    seen.add(selectionKey);
    dedupedSelections.push(selection);
  }

  return dedupedSelections;
};

const parsePersistedSelectionHistory = (
  value: unknown,
  manifest: LoadedDevLauncherManifest
): string[][] => {
  if (!(isRecord(value) && Array.isArray(value.recentSelections))) {
    return [];
  }

  const parsedSelections: string[][] = [];
  for (const selection of value.recentSelections) {
    if (!Array.isArray(selection)) {
      continue;
    }

    const normalizedSelection = normalizeSelection(
      manifest,
      selection.filter((entry): entry is string => typeof entry === 'string')
    );
    if (normalizedSelection.length > 0) {
      parsedSelections.push(normalizedSelection);
    }
  }

  return dedupeSelections(parsedSelections).slice(0, MAX_RECENT_SELECTIONS);
};

export const resolveDevLauncherSelectionHistoryPath = (
  manifest: LoadedDevLauncherManifest,
  runtime: SelectionHistoryRuntime = defaultRuntime
): string => {
  const repoHash = getDevLauncherRepoHash(manifest.repoRoot);

  return path.join(
    getDevLauncherStateRoot(runtime),
    'dev-launcher',
    `${repoHash}.json`
  );
};

/**
 * Loads recent service selections for this repo from a user-local state file.
 * Invalid, stale, or unreadable state is treated as empty history.
 */
export const loadRecentDevServiceSelections = (
  manifest: LoadedDevLauncherManifest,
  runtime: SelectionHistoryRuntime = defaultRuntime
): string[][] => {
  const historyPath = resolveDevLauncherSelectionHistoryPath(manifest, runtime);
  if (!fs.existsSync(historyPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(historyPath, 'utf-8');
    return parsePersistedSelectionHistory(JSON.parse(content), manifest);
  } catch {
    return [];
  }
};

/**
 * Persists the selected service set for later reuse in the startup selector.
 * History is best-effort and never blocks launcher behavior on disk failures.
 */
export const saveRecentDevServiceSelection = (
  manifest: LoadedDevLauncherManifest,
  serviceIds: Iterable<string>,
  runtime: SelectionHistoryRuntime = defaultRuntime
): void => {
  const normalizedSelection = normalizeSelection(manifest, serviceIds);
  if (normalizedSelection.length === 0) {
    return;
  }

  const recentSelections = dedupeSelections([
    normalizedSelection,
    ...loadRecentDevServiceSelections(manifest, runtime),
  ]).slice(0, MAX_RECENT_SELECTIONS);

  const historyPath = resolveDevLauncherSelectionHistoryPath(manifest, runtime);
  const payload: PersistedSelectionHistory = {
    recentSelections,
    repoRoot: manifest.repoRoot,
    version: 1,
  };

  try {
    fs.mkdirSync(path.dirname(historyPath), { recursive: true });
    fs.writeFileSync(historyPath, JSON.stringify(payload, null, 2));
  } catch {
    // Persisted history is UX-only state and should never block the launcher.
  }
};
