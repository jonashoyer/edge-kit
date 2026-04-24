import { normalizeSelectedServiceIds } from './manifest';
import type { DevLauncherProcessController } from './process-manager';
import {
  loadRecentDevServiceSelections,
  saveRecentDevServiceSelection,
} from './selection-history';
import type { LoadedDevLauncherManifest } from './types';

export interface DevLauncherPromptChoice {
  description?: string;
  title: string;
  value: string | 'custom';
}

export interface DevLauncherPromptMultiSelectChoice {
  description?: string;
  title: string;
  value: string;
}

export interface DevLauncherPromptRuntime {
  canPrompt: boolean;
  prompt: (
    question: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
}

export interface SessionStartupOption {
  kind: 'custom' | 'recent';
  label: string;
  serviceIds: string[];
}

export interface ResolvedSessionStartupSelection {
  recentSelections: string[][];
  selectedServiceIds: string[];
  source: 'explicit' | 'non_interactive_fallback' | 'startup_disabled';
}

export interface SessionSelectionApplicationOptions {
  persistSelection?: boolean;
}

export interface SessionExitRequestOptions {
  controller: DevLauncherProcessController;
  exitCode: number;
  onRequestExit?: (options: {
    controller: DevLauncherProcessController;
    exitCode: number;
  }) => Promise<void>;
  shouldDelegateExit?: boolean;
}

const getServiceListLabel = (
  manifest: LoadedDevLauncherManifest,
  serviceIds: Iterable<string>
): string => {
  const normalizedServiceIds = normalizeSelectedServiceIds(
    manifest,
    serviceIds
  );
  return normalizedServiceIds
    .map((serviceId) => manifest.servicesById[serviceId]?.label ?? serviceId)
    .join(', ');
};

export const buildStartupChoices = (
  manifest: LoadedDevLauncherManifest
): DevLauncherPromptChoice[] => {
  const recentSelections = loadRecentDevServiceSelections(manifest);
  const recentChoices = recentSelections.map((serviceIds, index) => ({
    title: getServiceListLabel(manifest, serviceIds),
    value: `${index}`,
  }));

  return [
    ...recentChoices,
    {
      description: 'Choose an ad hoc combination of declared services',
      title: 'Custom selection',
      value: 'custom',
    },
  ];
};

export const buildServiceChoices = (
  manifest: LoadedDevLauncherManifest
): DevLauncherPromptMultiSelectChoice[] => {
  return manifest.serviceIdsInOrder.map((serviceId) => {
    const service = manifest.servicesById[serviceId];

    return {
      description: service?.description,
      title: service?.label ?? serviceId,
      value: serviceId,
    };
  });
};

export const getStartupOptions = (
  manifest: LoadedDevLauncherManifest,
  recentSelections: string[][]
): SessionStartupOption[] => {
  return [
    ...recentSelections.map((serviceIds) => ({
      kind: 'recent' as const,
      label: getServiceListLabel(manifest, serviceIds),
      serviceIds,
    })),
    {
      kind: 'custom' as const,
      label: 'Custom selection',
      serviceIds: [] as string[],
    },
  ];
};

export const resolveSessionStartupSelection = (
  manifest: LoadedDevLauncherManifest,
  initialServiceIds?: string[],
  options?: {
    allowStartupSelection?: boolean;
  }
): ResolvedSessionStartupSelection => {
  const recentSelections = loadRecentDevServiceSelections(manifest);

  if (options?.allowStartupSelection === false) {
    return {
      recentSelections,
      selectedServiceIds: initialServiceIds
        ? normalizeSelectedServiceIds(manifest, initialServiceIds)
        : [],
      source: 'startup_disabled',
    };
  }

  if (initialServiceIds && initialServiceIds.length > 0) {
    return {
      recentSelections,
      selectedServiceIds: normalizeSelectedServiceIds(
        manifest,
        initialServiceIds
      ),
      source: 'explicit',
    };
  }

  return {
    recentSelections,
    selectedServiceIds: recentSelections.at(0) ?? manifest.serviceIdsInOrder,
    source: 'non_interactive_fallback',
  };
};

export const promptForServiceSelection = async (
  manifest: LoadedDevLauncherManifest,
  runtime: DevLauncherPromptRuntime,
  initialServiceIds?: string[],
  options?: {
    allowStartupSelection?: boolean;
  }
): Promise<string[] | null> => {
  const startupSelection = resolveSessionStartupSelection(
    manifest,
    initialServiceIds,
    options
  );

  if (startupSelection.source !== 'non_interactive_fallback') {
    return startupSelection.selectedServiceIds;
  }

  const { recentSelections } = startupSelection;

  if (!runtime.canPrompt) {
    return startupSelection.selectedServiceIds;
  }

  if (recentSelections.length === 0) {
    const serviceResponse = await runtime.prompt({
      choices: buildServiceChoices(manifest),
      hint: '- Space to toggle, Enter to launch',
      instructions: false,
      message: 'Select services to launch',
      min: 1,
      name: 'serviceIds',
      type: 'multiselect',
    });
    const selectedServiceIds = serviceResponse.serviceIds;

    if (!Array.isArray(selectedServiceIds) || selectedServiceIds.length === 0) {
      return null;
    }

    return normalizeSelectedServiceIds(manifest, selectedServiceIds);
  }

  const presetResponse = await runtime.prompt({
    choices: getStartupOptions(manifest, recentSelections).map(
      (option, index) => ({
        title: option.label,
        value: option.kind === 'custom' ? 'custom' : `${index}`,
      })
    ),
    initial: 0,
    message: 'Choose a recent service selection or start a custom selection',
    name: 'selection',
    type: 'select',
  });
  const selection = presetResponse.selection;

  if (selection == null) {
    return null;
  }

  if (selection !== 'custom') {
    const selectedIndex = Number(selection);
    return recentSelections.at(selectedIndex) ?? null;
  }

  const serviceResponse = await runtime.prompt({
    choices: buildServiceChoices(manifest),
    hint: '- Space to toggle, Enter to launch',
    instructions: false,
    message: 'Select services to launch',
    min: 1,
    name: 'serviceIds',
    type: 'multiselect',
  });
  const selectedServiceIds = serviceResponse.serviceIds;

  if (!Array.isArray(selectedServiceIds) || selectedServiceIds.length === 0) {
    return null;
  }

  return normalizeSelectedServiceIds(manifest, selectedServiceIds);
};

export const applySessionServiceSelection = async (
  manifest: LoadedDevLauncherManifest,
  controller: DevLauncherProcessController,
  serviceIds: Iterable<string>,
  options?: SessionSelectionApplicationOptions
): Promise<string[]> => {
  const normalizedServiceIds = normalizeSelectedServiceIds(
    manifest,
    serviceIds
  );
  await controller.applyServiceSet(normalizedServiceIds);

  if (options?.persistSelection !== false && normalizedServiceIds.length > 0) {
    saveRecentDevServiceSelection(manifest, normalizedServiceIds);
  }

  return normalizedServiceIds;
};

export const requestSessionViewExit = async (
  options: SessionExitRequestOptions
): Promise<void> => {
  if (options.shouldDelegateExit && options.onRequestExit) {
    await options.onRequestExit({
      controller: options.controller,
      exitCode: options.exitCode,
    });
    return;
  }

  await options.controller.stopAll();
};

export const formatSelectedServiceListLabel = getServiceListLabel;
