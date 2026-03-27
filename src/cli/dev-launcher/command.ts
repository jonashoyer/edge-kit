/** biome-ignore-all lint/suspicious/noConsole: CLI command output is intentional. */
import { Command } from 'commander';
import {
  resolveInitialServiceIds,
  runDevLauncherAttachCommand,
  runDevLauncherCommand,
  runDevLauncherHostCommand,
  runDevLauncherLogsCommand,
  runDevLauncherServiceRestartCommand,
  runDevLauncherServiceStartCommand,
  runDevLauncherServiceStopCommand,
  runDevLauncherServicesApplyCommand,
  runDevLauncherSessionStopCommand,
  runDevLauncherStatusCommand,
  type DevLauncherCommandOptions,
  type DevLauncherLogsCommandOptions,
  type DevLauncherServicesApplyCommandOptions,
  type DevLauncherSessionHostCommandOptions,
  type DevLauncherStatusCommandOptions,
  type DevLauncherStructuredOutputCommandOptions,
} from './session-commands';

const getCommandGlobalOptions = (
  command: Command
): {
  config?: string;
  noTui?: boolean;
} => {
  return command.optsWithGlobals<{
    config?: string;
    noTui?: boolean;
  }>();
};

export {
  resolveInitialServiceIds,
  runDevLauncherAttachCommand,
  runDevLauncherCommand,
  runDevLauncherHostCommand,
  runDevLauncherLogsCommand,
  runDevLauncherServiceRestartCommand,
  runDevLauncherServiceStartCommand,
  runDevLauncherServiceStopCommand,
  runDevLauncherServicesApplyCommand,
  runDevLauncherSessionStopCommand,
  runDevLauncherStatusCommand,
};

const handleCommand = async (
  callback: () => Promise<number>
): Promise<void> => {
  try {
    const exitCode = await callback();
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
};

/**
 * Creates the reusable `dev` command that can be embedded in a repo-level CLI.
 */
export const createDevLauncherCommand = (): Command => {
  const command = new Command('dev')
    .description(
      'Launch, attach to, and control local development services from dev-cli.config.ts'
    )
    .option('--config <path>', 'Path to a dev-cli.config.ts/.mts/.js/.mjs file')
    .option('--no-tui', 'Use the plain runner instead of the Ink TUI');

  command
    .option('--services <ids>', 'Launch a comma-separated list of service ids')
    .action(async (options: DevLauncherCommandOptions) => {
      await handleCommand(async () => await runDevLauncherCommand(options));
    });

  command.command('attach').action(async (_options, subcommand: Command) => {
    const mergedOptions = getCommandGlobalOptions(subcommand);
    await handleCommand(
      async () => await runDevLauncherAttachCommand(mergedOptions)
    );
  });

  command
    .command('host')
    .description('Start the socket-backed dev launcher session host')
    .option('--headless', 'Start the host without attaching a UI')
    .option('--services <ids>', 'Start the host with a selected service set')
    .action(
      async (options: DevLauncherSessionHostCommandOptions, subcommand) => {
        const mergedOptions = {
          ...getCommandGlobalOptions(subcommand),
          ...options,
        };
        await handleCommand(
          async () => await runDevLauncherHostCommand(mergedOptions)
        );
      }
    );

  command
    .command('status')
    .description('Show the current dev launcher session state')
    .option('--json', 'Emit machine-readable JSON output')
    .option('--toon', 'Emit LLM-friendly TOON output')
    .action(
      async (
        options: DevLauncherStructuredOutputCommandOptions,
        subcommand
      ) => {
        const mergedOptions: DevLauncherStatusCommandOptions = {
          ...getCommandGlobalOptions(subcommand),
          ...options,
        };
        await handleCommand(
          async () => await runDevLauncherStatusCommand(mergedOptions)
        );
      }
    );

  command
    .command('logs <serviceId>')
    .description('Read recent logs for a managed service')
    .option('--after <sequence>', 'Only return log lines after this sequence')
    .option('--follow', 'Poll for new logs until interrupted')
    .option('--json', 'Emit machine-readable JSON output')
    .option('--limit <count>', 'Maximum number of log lines to return')
    .option('--toon', 'Emit LLM-friendly TOON output')
    .action(
      async (
        serviceId: string,
        options: DevLauncherLogsCommandOptions,
        subcommand
      ) => {
        const mergedOptions = {
          ...getCommandGlobalOptions(subcommand),
          ...options,
        };
        await handleCommand(
          async () => await runDevLauncherLogsCommand(serviceId, mergedOptions)
        );
      }
    );

  const serviceCommand = command
    .command('service')
    .description('Control individual managed services');

  const addServiceCommand = (
    name: 'restart' | 'start' | 'stop',
    runner: (
      serviceId: string,
      options?: DevLauncherStatusCommandOptions
    ) => Promise<number>
  ): void => {
    serviceCommand
      .command(`${name} <serviceId>`)
      .option('--json', 'Emit machine-readable JSON output')
      .option('--toon', 'Emit LLM-friendly TOON output')
      .action(
        async (
          serviceId: string,
          options: DevLauncherStructuredOutputCommandOptions,
          subcommand
        ) => {
          const mergedOptions: DevLauncherStatusCommandOptions = {
            ...getCommandGlobalOptions(subcommand),
            ...options,
          };
          await handleCommand(async () => await runner(serviceId, mergedOptions));
        }
      );
  };

  addServiceCommand('start', runDevLauncherServiceStartCommand);
  addServiceCommand('stop', runDevLauncherServiceStopCommand);
  addServiceCommand('restart', runDevLauncherServiceRestartCommand);

  command
    .command('services')
    .description('Apply a managed service set')
    .command('apply')
    .requiredOption('--services <ids>', 'Comma-separated service ids')
    .option('--json', 'Emit machine-readable JSON output')
    .option('--toon', 'Emit LLM-friendly TOON output')
    .action(
      async (
        options: DevLauncherServicesApplyCommandOptions,
        subcommand: Command
      ) => {
        const mergedOptions = {
          ...getCommandGlobalOptions(subcommand),
          ...options,
        };
        await handleCommand(
          async () => await runDevLauncherServicesApplyCommand(mergedOptions)
        );
      }
    );

  command
    .command('session')
    .description('Control the session host')
    .command('stop')
    .option('--json', 'Emit machine-readable JSON output')
    .option('--toon', 'Emit LLM-friendly TOON output')
    .action(
      async (
        options: DevLauncherStructuredOutputCommandOptions,
        subcommand: Command
      ) => {
        const mergedOptions: DevLauncherStatusCommandOptions = {
          ...getCommandGlobalOptions(subcommand),
          ...options,
        };
        await handleCommand(
          async () => await runDevLauncherSessionStopCommand(mergedOptions)
        );
      }
    );

  return command;
};
