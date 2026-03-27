/** biome-ignore-all lint/suspicious/noConsole: CLI runner output is intentional. */
import prompts from 'prompts';
import { normalizeSelectedServiceIds } from './manifest';
import type { DevLauncherProcessController } from './process-manager';
import { DevLauncherProcessManager } from './process-manager';
import {
  loadRecentDevServiceSelections,
  saveRecentDevServiceSelection,
} from './selection-history';
import type { LoadedDevLauncherManifest } from './types';

export interface PromptChoice {
  description?: string;
  title: string;
  value: string | 'custom';
}

export interface PromptMultiSelectChoice {
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

export interface PlainDevSessionRuntime extends DevLauncherPromptRuntime {
  createController: (
    manifest: LoadedDevLauncherManifest
  ) => DevLauncherProcessController;
  stderr: Pick<NodeJS.WriteStream, 'write'>;
  stdout: Pick<NodeJS.WriteStream, 'write'>;
}

export interface PlainDevSessionOptions {
  allowStartupSelection?: boolean;
  applyInitialSelection?: boolean;
  exitWhenSelectionStops?: boolean;
  onRequestExit?: (options: {
    controller: DevLauncherProcessController;
    exitCode: number;
  }) => Promise<void>;
}

const defaultPromptRuntime: DevLauncherPromptRuntime = {
  canPrompt: Boolean(process.stdin.isTTY),
  prompt: async (question) => prompts(question as never),
};

const defaultRuntime: PlainDevSessionRuntime = {
  ...defaultPromptRuntime,
  createController: (manifest) => new DevLauncherProcessManager(manifest),
  stderr: process.stderr,
  stdout: process.stdout,
};

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
): PromptChoice[] => {
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
): PromptMultiSelectChoice[] => {
  return manifest.serviceIdsInOrder.map((serviceId) => {
    const service = manifest.servicesById[serviceId];

    return {
      description: service?.description,
      title: service?.label ?? serviceId,
      value: serviceId,
    };
  });
};

/**
 * Resolves the service selection for plain mode. Uses an explicit selection
 * when provided, otherwise prompts the user or falls back to the latest saved
 * selection.
 */
export const promptForServiceSelection = async (
  manifest: LoadedDevLauncherManifest,
  runtime: DevLauncherPromptRuntime = defaultPromptRuntime,
  initialServiceIds?: string[],
  options?: {
    allowStartupSelection?: boolean;
  }
): Promise<string[] | null> => {
  if (options?.allowStartupSelection === false) {
    return initialServiceIds
      ? normalizeSelectedServiceIds(manifest, initialServiceIds)
      : [];
  }

  if (initialServiceIds && initialServiceIds.length > 0) {
    return normalizeSelectedServiceIds(manifest, initialServiceIds);
  }

  const recentSelections = loadRecentDevServiceSelections(manifest);

  if (!runtime.canPrompt) {
    return recentSelections.at(0) ?? manifest.serviceIdsInOrder;
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
    choices: buildStartupChoices(manifest),
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

const formatPrefixedLogLine = (
  manifest: LoadedDevLauncherManifest,
  serviceId: string,
  line: string,
  stream: 'stderr' | 'stdout' | 'system'
): string => {
  const prefix = manifest.servicesById[serviceId]?.label ?? serviceId;
  return `[${prefix}:${stream}] ${line}\n`;
};

/**
 * Runs the non-TUI session. In interactive terminals it shows a prompt-based
 * startup flow, then streams prefixed logs until all managed services stop.
 */
export const runPlainDevSession = async (
  manifest: LoadedDevLauncherManifest,
  runtime: PlainDevSessionRuntime = defaultRuntime,
  initialServiceIds?: string[],
  options?: PlainDevSessionOptions
): Promise<number> => {
  const selectedServiceIds = await promptForServiceSelection(
    manifest,
    runtime,
    initialServiceIds,
    {
      allowStartupSelection: options?.allowStartupSelection,
    }
  );

  if (
    (!selectedServiceIds || selectedServiceIds.length === 0) &&
    options?.allowStartupSelection !== false
  ) {
    if (!runtime.canPrompt) {
      runtime.stderr.write(
        'No service selection was provided and there is no saved selection available for non-interactive plain mode.\n'
      );
      return 1;
    }

    runtime.stdout.write('Aborted.\n');
    return 0;
  }

  const normalizedSelection = normalizeSelectedServiceIds(
    manifest,
    selectedServiceIds ?? []
  );
  const shouldApplyInitialSelection = options?.applyInitialSelection !== false;

  if (shouldApplyInitialSelection && normalizedSelection.length > 0) {
    saveRecentDevServiceSelection(manifest, normalizedSelection);
    runtime.stdout.write(
      `Launching ${getServiceListLabel(manifest, normalizedSelection)}...\n`
    );
  }

  const controller = runtime.createController(manifest);
  let exitCode = 0;
  let highestSequence = 0;
  let isShuttingDown = false;

  const printNewLogs = (): void => {
    const snapshot = controller.getSnapshot();
    const newEntries = snapshot.allLogs.filter(
      (entry) => entry.sequence > highestSequence
    );

    for (const entry of newEntries) {
      highestSequence = Math.max(highestSequence, entry.sequence);
      runtime.stdout.write(
        formatPrefixedLogLine(
          manifest,
          entry.serviceId,
          entry.line,
          entry.stream
        )
      );
    }

    if (
      snapshot.managedServiceIds.some((serviceId) => {
        return snapshot.serviceStates[serviceId]?.status === 'failed';
      })
    ) {
      exitCode = 1;
    }
  };

  const unsubscribe = controller.subscribe(printNewLogs);
  printNewLogs();

  const awaitCompletion = new Promise<number>((resolve, reject) => {
    const signalHandlers: Array<{
      handler: () => void;
      signal: NodeJS.Signals;
    }> = [];

    const maybeResolve = (): void => {
      printNewLogs();
      const snapshot = controller.getSnapshot();
      const allStopped = snapshot.managedServiceIds.every((serviceId) => {
        const status = snapshot.serviceStates[serviceId]?.status;
        return status === 'failed' || status === 'idle' || status === 'stopped';
      });

      if (!allStopped) {
        return;
      }

      if (options?.exitWhenSelectionStops === false && !isShuttingDown) {
        return;
      }

      unsubscribe();
      for (const { handler, signal } of signalHandlers) {
        process.off(signal, handler);
      }
      resolve(exitCode);
    };

    const requestShutdown = (): void => {
      if (isShuttingDown) {
        return;
      }

      isShuttingDown = true;
      const requestExit =
        options?.onRequestExit ??
        (async (requestOptions: {
          controller: DevLauncherProcessController;
          exitCode: number;
        }) => {
          await requestOptions.controller.stopAll();
        });
      requestExit({
        controller,
        exitCode,
      })
        .then(() => {
          if (options?.onRequestExit) {
            unsubscribe();
            for (const { handler, signal } of signalHandlers) {
              process.off(signal, handler);
            }
            resolve(exitCode);
            return;
          }

          maybeResolve();
        })
        .catch(reject);
    };

    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      const handler = (): void => {
        requestShutdown();
      };
      process.on(signal, handler);
      signalHandlers.push({ handler, signal });
    }

    const completionUnsubscribe = controller.subscribe(() => {
      maybeResolve();
    });

    const startPromise = shouldApplyInitialSelection
      ? controller.applyServiceSet(normalizedSelection)
      : Promise.resolve();

    startPromise
      .then(() => {
        maybeResolve();
      })
      .catch((error) => {
        completionUnsubscribe();
        reject(error);
      });
  });

  return await awaitCompletion.finally(() => {
    unsubscribe();
  });
};
