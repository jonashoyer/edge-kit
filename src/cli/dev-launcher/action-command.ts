/** biome-ignore-all lint/suspicious/noConsole: CLI command output is intentional. */
import { spawn } from 'node:child_process';
import { Command } from 'commander';
import type {
  DevActionRunExecutionResult,
  DevActionRunnerRuntime,
  ResolvedDevAction,
} from './action-runner';
import { listDevActions, runDevAction } from './action-runner';
import type { LoadedDevActionsConfig } from './actions-config';
import { loadDevActionsConfig } from './actions-config';
import { loadDevLauncherManifest } from './manifest';
import type { LoadedDevLauncherManifest } from './types';

export interface DevActionCommandGlobalOptions {
  actionsConfig?: string;
}

export interface DevActionListCommandOptions
  extends DevActionCommandGlobalOptions {
  json?: boolean;
}

export interface DevActionRunCommandOptions
  extends DevActionCommandGlobalOptions {
  force?: boolean;
}

export interface DevActionCommandRuntime {
  actionRuntime: DevActionRunnerRuntime;
  listActions: (
    manifest: LoadedDevLauncherManifest,
    actionsConfig: LoadedDevActionsConfig,
    runtime: DevActionRunnerRuntime
  ) => Promise<ResolvedDevAction[]>;
  loadActionsConfig: (options?: {
    actionsConfigPath?: string;
    cwd?: string;
    optional?: boolean;
  }) => Promise<LoadedDevActionsConfig | null>;
  loadManifest: (options?: {
    configPath?: string;
    cwd?: string;
  }) => LoadedDevLauncherManifest;
  runAction: (
    manifest: LoadedDevLauncherManifest,
    actionsConfig: LoadedDevActionsConfig,
    actionId: string,
    options?: {
      force?: boolean;
      runtime?: DevActionRunnerRuntime;
    }
  ) => Promise<DevActionRunExecutionResult>;
  stderr: Pick<NodeJS.WriteStream, 'write'>;
  stdout: Pick<NodeJS.WriteStream, 'write'>;
}

const createDefaultActionRuntime = (): DevActionRunnerRuntime => ({
  cwd: process.cwd(),
  env: process.env,
  platform: process.platform,
  spawn: (command, args, options) => spawn(command, args, options),
  stderr: process.stderr,
  stdout: process.stdout,
});

const defaultRuntime: DevActionCommandRuntime = {
  actionRuntime: createDefaultActionRuntime(),
  listActions: async (manifest, actionsConfig, runtime) => {
    return await listDevActions(manifest, actionsConfig, runtime);
  },
  loadActionsConfig: async (options) => loadDevActionsConfig(options),
  loadManifest: (options) => loadDevLauncherManifest(options),
  runAction: async (manifest, actionsConfig, actionId, options) => {
    return await runDevAction(manifest, actionsConfig, actionId, options);
  },
  stderr: process.stderr,
  stdout: process.stdout,
};

const getCommandGlobalOptions = (
  command: Command
): DevActionCommandGlobalOptions => {
  return command.optsWithGlobals<DevActionCommandGlobalOptions>();
};

const formatActionStatusLine = (action: ResolvedDevAction): string => {
  const status = action.available ? 'available' : 'unavailable';
  const reasonSuffix = action.reason ? ` - ${action.reason}` : '';
  return `${status} ${action.id} (${action.label})${reasonSuffix}`;
};

/**
 * Lists configured developer actions and their availability.
 */
export const runDevActionListCommand = async (
  options: DevActionListCommandOptions = {},
  runtime: DevActionCommandRuntime = {
    ...defaultRuntime,
    actionRuntime: createDefaultActionRuntime(),
  }
): Promise<number> => {
  const manifest = runtime.loadManifest({
    cwd: runtime.actionRuntime.cwd,
  });
  const actionsConfig = await runtime.loadActionsConfig({
    actionsConfigPath: options.actionsConfig,
    cwd: runtime.actionRuntime.cwd,
  });

  if (!actionsConfig) {
    throw new Error('No actions config was found.');
  }

  const actions = await runtime.listActions(
    manifest,
    actionsConfig,
    runtime.actionRuntime
  );

  if (options.json) {
    runtime.stdout.write(`${JSON.stringify(actions, null, 2)}\n`);
    return 0;
  }

  for (const action of actions) {
    runtime.stdout.write(`${formatActionStatusLine(action)}\n`);
  }

  return 0;
};

/**
 * Runs a single configured developer action.
 */
export const runDevActionRunCommand = async (
  actionId: string,
  options: DevActionRunCommandOptions = {},
  runtime: DevActionCommandRuntime = {
    ...defaultRuntime,
    actionRuntime: createDefaultActionRuntime(),
  }
): Promise<number> => {
  const manifest = runtime.loadManifest({
    cwd: runtime.actionRuntime.cwd,
  });
  const actionsConfig = await runtime.loadActionsConfig({
    actionsConfigPath: options.actionsConfig,
    cwd: runtime.actionRuntime.cwd,
  });

  if (!actionsConfig) {
    throw new Error('No actions config was found.');
  }

  const result = await runtime.runAction(manifest, actionsConfig, actionId, {
    force: options.force,
    runtime: runtime.actionRuntime,
  });

  if (result.summary) {
    runtime.stdout.write(`${result.summary}\n`);
  } else {
    runtime.stdout.write(`Completed action "${actionId}".\n`);
  }

  return 0;
};

/**
 * Creates the reusable `action` command for TS-defined one-shot developer
 * tasks.
 */
export const createDevLauncherActionCommand = (
  runtime: DevActionCommandRuntime = {
    ...defaultRuntime,
    actionRuntime: createDefaultActionRuntime(),
  }
): Command => {
  const command = new Command('action')
    .description('List and run one-shot developer actions')
    .option(
      '--actions-config <path>',
      'Path to a dev-cli.actions.ts/.mts/.js/.mjs file'
    );

  command
    .command('list')
    .description('List configured developer actions')
    .option('--json', 'Emit machine-readable JSON output')
    .action(
      async (options: DevActionListCommandOptions, subcommand: Command) => {
        try {
          const mergedOptions = {
            ...getCommandGlobalOptions(subcommand),
            ...options,
          };
          const exitCode = await runDevActionListCommand(
            mergedOptions,
            runtime
          );
          if (exitCode !== 0) {
            process.exitCode = exitCode;
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(message);
          process.exitCode = 1;
        }
      }
    );

  command
    .command('run <id>')
    .description('Run a configured developer action')
    .option('--force', 'Run the action even when it reports unavailable')
    .action(
      async (
        id: string,
        options: DevActionRunCommandOptions,
        subcommand: Command
      ) => {
        try {
          const mergedOptions = {
            ...getCommandGlobalOptions(subcommand),
            ...options,
          };
          const exitCode = await runDevActionRunCommand(
            id,
            mergedOptions,
            runtime
          );
          if (exitCode !== 0) {
            process.exitCode = exitCode;
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(message);
          process.exitCode = 1;
        }
      }
    );

  return command;
};
