/** biome-ignore-all lint/suspicious/noConsole: CLI runner output is intentional. */
import prompts from 'prompts';
import type { DevLauncherProcessController } from './process-manager';
import { DevLauncherProcessManager } from './process-manager';
import {
  applySessionServiceSelection,
  type DevLauncherPromptRuntime,
  formatSelectedServiceListLabel,
  promptForServiceSelection,
  requestSessionViewExit,
} from './session-view-orchestrator';
import type { LoadedDevLauncherManifest } from './types';

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

  const controller = runtime.createController(manifest);
  const normalizedSelection = selectedServiceIds ?? [];
  const shouldApplyInitialSelection = options?.applyInitialSelection !== false;

  if (shouldApplyInitialSelection && normalizedSelection.length > 0) {
    await applySessionServiceSelection(manifest, controller, normalizedSelection);
    runtime.stdout.write(
      `Launching ${formatSelectedServiceListLabel(manifest, normalizedSelection)}...\n`
    );
  }

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
  let completionUnsubscribe = (): void => undefined;
  let cleanup = (): void => {
    completionUnsubscribe();
    unsubscribe();
  };

  const awaitCompletion = new Promise<number>((resolve, reject) => {
    const signalHandlers: Array<{
      handler: () => void;
      signal: NodeJS.Signals;
    }> = [];
    let didCleanup = false;

    cleanup = (): void => {
      if (didCleanup) {
        return;
      }

      didCleanup = true;
      completionUnsubscribe();
      unsubscribe();

      for (const { handler, signal } of signalHandlers) {
        process.off(signal, handler);
      }
    };

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

      cleanup();
      resolve(exitCode);
    };

    const requestShutdown = (): void => {
      if (isShuttingDown) {
        return;
      }

      isShuttingDown = true;
      requestSessionViewExit({
        controller,
        exitCode,
        onRequestExit: options?.onRequestExit,
        shouldDelegateExit: Boolean(options?.onRequestExit),
      })
        .then(() => {
          if (options?.onRequestExit) {
            cleanup();
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

    completionUnsubscribe = controller.subscribe(() => {
      maybeResolve();
    });

    const startPromise = Promise.resolve();

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
    cleanup();
  });
};
