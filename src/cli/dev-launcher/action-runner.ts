/** biome-ignore-all lint/suspicious/noConsole: CLI output helpers are intentional. */
import { spawn } from 'node:child_process';
import path from 'node:path';
import type {
  DevActionAvailabilityResult,
  DevActionContext,
  DevActionDefinition,
  DevActionExecOptions,
  DevActionExecResult,
  DevActionImpactPolicy,
  DevActionRunResult,
} from './actions';
import type { LoadedDevActionsConfig } from './actions-config';
import type { LoadedDevLauncherManifest } from './types';

interface SpawnedExecProcess {
  on: (
    event: 'close' | 'error',
    listener: (...args: unknown[]) => void
  ) => SpawnedExecProcess;
  stderr: NodeJS.ReadableStream | null;
  stdout: NodeJS.ReadableStream | null;
}

interface ExecSpawnOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  shell: false;
  stdio: 'inherit' | 'pipe';
}

export interface DevActionRunnerRuntime {
  captureInheritedStdio?: boolean;
  cwd: string;
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  spawn: (
    command: string,
    args: string[],
    options: ExecSpawnOptions
  ) => SpawnedExecProcess;
  stderr: Pick<NodeJS.WriteStream, 'write'>;
  stdout: Pick<NodeJS.WriteStream, 'write'>;
}

export interface ResolvedDevAction {
  available: boolean;
  description?: string;
  id: string;
  impactPolicy: DevActionImpactPolicy;
  label: string;
  reason?: string;
  suggestInDev: boolean;
}

export interface DevActionRunExecutionResult {
  action: ResolvedDevAction;
  forced: boolean;
  summary?: string;
}

export interface DevActionSuggestion {
  action: ResolvedDevAction;
  message: string;
}

const defaultRuntime: DevActionRunnerRuntime = {
  cwd: process.cwd(),
  env: process.env,
  platform: process.platform,
  spawn: (command, args, options) => spawn(command, args, options),
  stderr: process.stderr,
  stdout: process.stdout,
};

const getPnpmCommand = (platform: NodeJS.Platform): string => {
  return platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
};

const formatCommand = (command: string, args: string[]): string => {
  const renderedArgs = args.map((argument) => {
    return argument.includes(' ') ? JSON.stringify(argument) : argument;
  });

  return [command, ...renderedArgs].join(' ');
};

const buildLogger = (
  stdout: Pick<NodeJS.WriteStream, 'write'>,
  stderr: Pick<NodeJS.WriteStream, 'write'>
) => {
  return {
    error: (message: string) => {
      stderr.write(`error: ${message}\n`);
    },
    info: (message: string) => {
      stdout.write(`info: ${message}\n`);
    },
    warn: (message: string) => {
      stderr.write(`warn: ${message}\n`);
    },
  };
};

const buildOutput = (stdout: Pick<NodeJS.WriteStream, 'write'>) => {
  return {
    write: (value: string) => {
      stdout.write(value);
    },
    writeLine: (value: string) => {
      stdout.write(`${value}\n`);
    },
  };
};

const silentWriter = {
  write: (_value: string) => true,
};

const normalizeAvailabilityResult = (
  actionId: string,
  value: boolean | DevActionAvailabilityResult
): DevActionAvailabilityResult => {
  if (typeof value === 'boolean') {
    return { available: value };
  }

  if (
    typeof value !== 'object' ||
    value === null ||
    typeof value.available !== 'boolean'
  ) {
    throw new Error(
      `Action "${actionId}" returned an invalid availability result. Expected a boolean or { available, reason? }.`
    );
  }

  if (value.reason !== undefined && typeof value.reason !== 'string') {
    throw new Error(
      `Action "${actionId}" returned an invalid availability reason.`
    );
  }

  return {
    available: value.available,
    reason: value.reason,
  };
};

const normalizeRunResult = (
  actionId: string,
  value: DevActionRunResult | undefined
): DevActionRunResult => {
  if (value === undefined) {
    return {};
  }

  if (
    typeof value !== 'object' ||
    value === null ||
    (value.summary !== undefined && typeof value.summary !== 'string')
  ) {
    throw new Error(
      `Action "${actionId}" returned an invalid run result. Expected void or { summary?: string }.`
    );
  }

  return value;
};

const resolveExecCwd = (repoRoot: string, cwd: string | undefined): string => {
  if (!cwd) {
    return repoRoot;
  }

  return path.isAbsolute(cwd) ? cwd : path.resolve(repoRoot, cwd);
};

const createExecHelper = (
  repoRoot: string,
  runtime: DevActionRunnerRuntime
): DevActionContext['exec'] => {
  return async (
    command: string,
    args: string[] = [],
    options: DevActionExecOptions = {}
  ): Promise<DevActionExecResult> => {
    const cwd = resolveExecCwd(repoRoot, options.cwd);
    const requestedStdio = options.stdio ?? 'pipe';
    const stdio =
      requestedStdio === 'inherit' && runtime.captureInheritedStdio
        ? 'pipe'
        : requestedStdio;
    const env = {
      ...runtime.env,
      ...options.env,
    };

    return await new Promise<DevActionExecResult>((resolve, reject) => {
      const child = runtime.spawn(command, args, {
        cwd,
        env,
        shell: false,
        stdio,
      });
      let stdout = '';
      let stderr = '';
      let settled = false;

      const rejectWithError = (message: string): void => {
        if (settled) {
          return;
        }

        settled = true;
        reject(new Error(message));
      };

      if (stdio === 'pipe') {
        child.stdout?.on('data', (chunk) => {
          stdout += String(chunk);
        });
        child.stderr?.on('data', (chunk) => {
          stderr += String(chunk);
        });
      }

      child.on('error', (error) => {
        const message = error instanceof Error ? error.message : String(error);
        rejectWithError(
          `Failed to execute ${formatCommand(command, args)}: ${message}`
        );
      });

      child.on('close', (code) => {
        if (settled) {
          return;
        }

        const exitCode = typeof code === 'number' ? code : 1;
        const result = {
          args,
          command,
          cwd,
          exitCode,
          stderr,
          stdout,
        };

        if (exitCode !== 0 && options.rejectOnNonZero !== false) {
          const stderrSuffix =
            stderr.trim().length > 0 ? `\n${stderr.trimEnd()}` : '';
          rejectWithError(
            `${formatCommand(command, args)} exited with code ${exitCode}.${stderrSuffix}`
          );
          return;
        }

        settled = true;
        resolve(result);
      });
    });
  };
};

const createActionContext = (
  manifest: LoadedDevLauncherManifest,
  actionsConfigPath: string,
  runtime: DevActionRunnerRuntime,
  outputWriters: {
    stderr: Pick<NodeJS.WriteStream, 'write'>;
    stdout: Pick<NodeJS.WriteStream, 'write'>;
  }
): DevActionContext => {
  const exec = createExecHelper(manifest.repoRoot, runtime);

  return {
    actionsConfigPath,
    configPath: manifest.configPath,
    cwd: runtime.cwd,
    exec,
    logger: buildLogger(outputWriters.stdout, outputWriters.stderr),
    manifest,
    output: buildOutput(outputWriters.stdout),
    pnpm: async (args = [], options = {}) => {
      return await exec(getPnpmCommand(runtime.platform), args, options);
    },
    repoRoot: manifest.repoRoot,
  };
};

const evaluateAvailabilityForAction = async (
  actionId: string,
  action: DevActionDefinition,
  manifest: LoadedDevLauncherManifest,
  actionsConfigPath: string,
  runtime: DevActionRunnerRuntime,
  outputMode: 'silent' | 'visible'
): Promise<ResolvedDevAction> => {
  const outputWriters =
    outputMode === 'visible'
      ? {
          stderr: runtime.stderr,
          stdout: runtime.stdout,
        }
      : {
          stderr: silentWriter,
          stdout: silentWriter,
        };

  const context = createActionContext(
    manifest,
    actionsConfigPath,
    runtime,
    outputWriters
  );

  try {
    const availability = action.isAvailable
      ? normalizeAvailabilityResult(actionId, await action.isAvailable(context))
      : { available: true };

    return {
      available: availability.available,
      description: action.description,
      id: actionId,
      impactPolicy: action.impactPolicy,
      label: action.label,
      reason: availability.reason,
      suggestInDev: action.suggestInDev ?? false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to evaluate availability for action "${actionId}": ${message}`
    );
  }
};

const formatSuggestionMessage = (action: ResolvedDevAction): string => {
  let prefix = 'Action available';
  if (action.impactPolicy === 'stop-all') {
    prefix = 'Action available before starting services';
  } else if (action.impactPolicy === 'stop-selected') {
    prefix = 'Action available before changing selected services';
  }
  const reasonSuffix = action.reason ? ` (${action.reason})` : '';

  return `${prefix}: ${action.id} - run pnpm cli action run ${action.id}${reasonSuffix}`;
};

/**
 * Evaluates all registered actions and returns their current availability.
 */
export const listDevActions = async (
  manifest: LoadedDevLauncherManifest,
  actionsConfig: LoadedDevActionsConfig,
  runtime: DevActionRunnerRuntime = defaultRuntime
): Promise<ResolvedDevAction[]> => {
  const results: ResolvedDevAction[] = [];

  for (const actionId of actionsConfig.actionIdsInOrder) {
    const action = actionsConfig.actionsById[actionId];
    if (!action) {
      continue;
    }

    results.push(
      await evaluateAvailabilityForAction(
        actionId,
        action,
        manifest,
        actionsConfig.configPath,
        runtime,
        'silent'
      )
    );
  }

  return results;
};

/**
 * Runs one configured action after evaluating availability unless forced.
 */
export const runDevAction = async (
  manifest: LoadedDevLauncherManifest,
  actionsConfig: LoadedDevActionsConfig,
  actionId: string,
  options?: {
    force?: boolean;
    runtime?: DevActionRunnerRuntime;
  }
): Promise<DevActionRunExecutionResult> => {
  const action = actionsConfig.actionsById[actionId];
  if (!action) {
    throw new Error(`Unknown dev action "${actionId}".`);
  }

  const runtime = options?.runtime ?? defaultRuntime;
  const resolvedAction = await evaluateAvailabilityForAction(
    actionId,
    action,
    manifest,
    actionsConfig.configPath,
    runtime,
    'silent'
  );

  if (!(resolvedAction.available || options?.force)) {
    const reasonSuffix = resolvedAction.reason
      ? ` ${resolvedAction.reason}`
      : '';
    throw new Error(
      `Action "${actionId}" is unavailable.${reasonSuffix}`.trimEnd()
    );
  }

  const context = createActionContext(
    manifest,
    actionsConfig.configPath,
    runtime,
    {
      stderr: runtime.stderr,
      stdout: runtime.stdout,
    }
  );

  if (!resolvedAction.available && options?.force) {
    context.logger.warn(
      `Running unavailable action "${actionId}" because --force was provided.`
    );
  }

  try {
    const runResult = normalizeRunResult(actionId, await action.run(context));
    return {
      action: resolvedAction,
      forced: options?.force ?? false,
      summary: runResult.summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Action "${actionId}" failed: ${message}`);
  }
};

/**
 * Evaluates only actions that opt into dev-start suggestions.
 */
export const getDevPreflightActionSuggestions = async (
  manifest: LoadedDevLauncherManifest,
  actionsConfig: LoadedDevActionsConfig,
  runtime: DevActionRunnerRuntime = defaultRuntime
): Promise<DevActionSuggestion[]> => {
  const suggestions: DevActionSuggestion[] = [];

  for (const actionId of actionsConfig.actionIdsInOrder) {
    const action = actionsConfig.actionsById[actionId];
    if (!action || !action.suggestInDev) {
      continue;
    }

    try {
      const resolvedAction = await evaluateAvailabilityForAction(
        actionId,
        action,
        manifest,
        actionsConfig.configPath,
        runtime,
        'silent'
      );

      if (resolvedAction.available) {
        suggestions.push({
          action: resolvedAction,
          message: formatSuggestionMessage(resolvedAction),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      runtime.stderr.write(`${message}\n`);
    }
  }

  return suggestions;
};
