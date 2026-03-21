/** biome-ignore-all lint/suspicious/noConsole: CLI runner output is intentional. */
import prompts from 'prompts';
import { getPresetServiceIds, normalizeSelectedServiceIds } from './manifest';
import type { DevLauncherProcessController } from './process-manager';
import { DevLauncherProcessManager } from './process-manager';
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

export const buildPresetChoices = (
  manifest: LoadedDevLauncherManifest
): PromptChoice[] => {
  const presetChoices = manifest.presetIdsInOrder.map((presetId) => {
    const preset = manifest.presetsById[presetId];

    return {
      description: preset?.description,
      title: preset?.label ?? presetId,
      value: presetId,
    };
  });

  return [
    ...presetChoices,
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
 * when provided, otherwise prompts the user or falls back to the first preset.
 */
export const promptForServiceSelection = async (
  manifest: LoadedDevLauncherManifest,
  runtime: DevLauncherPromptRuntime = defaultPromptRuntime,
  initialServiceIds?: string[]
): Promise<string[] | null> => {
  if (initialServiceIds && initialServiceIds.length > 0) {
    return normalizeSelectedServiceIds(manifest, initialServiceIds);
  }

  if (!runtime.canPrompt) {
    const fallbackPresetId = manifest.presetIdsInOrder.at(0);
    return fallbackPresetId
      ? getPresetServiceIds(manifest, fallbackPresetId)
      : null;
  }

  const presetResponse = await runtime.prompt({
    choices: buildPresetChoices(manifest),
    initial: 0,
    message: 'Choose a preset or start a custom selection',
    name: 'selection',
    type: 'select',
  });
  const selection = presetResponse.selection;

  if (selection == null) {
    return null;
  }

  if (selection !== 'custom') {
    return getPresetServiceIds(manifest, String(selection));
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
  initialServiceIds?: string[]
): Promise<number> => {
  const selectedServiceIds = await promptForServiceSelection(
    manifest,
    runtime,
    initialServiceIds
  );

  if (!selectedServiceIds || selectedServiceIds.length === 0) {
    if (!runtime.canPrompt) {
      runtime.stderr.write(
        'No preset was provided and the manifest does not define a default preset for non-interactive plain mode.\n'
      );
      return 1;
    }

    runtime.stdout.write('Aborted.\n');
    return 0;
  }

  const normalizedSelection = normalizeSelectedServiceIds(
    manifest,
    selectedServiceIds
  );
  runtime.stdout.write(
    `Launching ${getServiceListLabel(manifest, normalizedSelection)}...\n`
  );

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
      controller
        .stopAll()
        .then(() => {
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

    controller
      .applyServiceSet(normalizedSelection)
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
