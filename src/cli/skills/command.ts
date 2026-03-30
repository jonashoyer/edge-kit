/** biome-ignore-all lint/suspicious/noConsole: CLI command output is intentional. */
import { Command } from 'commander';
import {
  defaultSkillsCommandRuntime,
  runSkillsInfoCommand,
  runSkillsInstallCommand,
  runSkillsListCommand,
  runSkillsRemoveCommand,
  runSkillsVerifyCommand,
  type SkillsCommandGlobalOptions,
  type SkillsCommandRuntime,
  type SkillsInfoCommandOptions,
  type SkillsInstallCommandOptions,
  type SkillsListCommandOptions,
  type SkillsRemoveCommandOptions,
  type SkillsVerifyCommandOptions,
} from './skills';

const getCommandGlobalOptions = (
  command: Command
): SkillsCommandGlobalOptions => {
  return command.optsWithGlobals<SkillsCommandGlobalOptions>();
};

const handleCommandError = (error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
};

const setProcessExitCode = (exitCode: number): void => {
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
};

/**
 * Creates the reusable `skills` command family for installing and managing
 * user-global Codex skill directories.
 */
export const createSkillsCommand = (
  runtime: SkillsCommandRuntime = defaultSkillsCommandRuntime
): Command => {
  const command = new Command('skills')
    .description('Install and manage global Codex skill directories')
    .option(
      '--tree <tree>',
      'Select the destination skill tree: codex or agents'
    )
    .option('--root <path>', 'Override the destination skills root directory');

  command
    .command('list')
    .description('List installed and tracked skills in the selected root')
    .option('--toon', 'Emit LLM-friendly TOON output')
    .action(async (options: SkillsListCommandOptions, subcommand: Command) => {
      try {
        const exitCode = await runSkillsListCommand(
          {
            ...getCommandGlobalOptions(subcommand),
            ...options,
          },
          runtime
        );
        setProcessExitCode(exitCode);
      } catch (error) {
        handleCommandError(error);
      }
    });

  command
    .command('info <name>')
    .description('Show provenance and hash details for one installed skill')
    .option('--toon', 'Emit LLM-friendly TOON output')
    .action(
      async (
        name: string,
        options: SkillsInfoCommandOptions,
        subcommand: Command
      ) => {
        try {
          const exitCode = await runSkillsInfoCommand(
            name,
            {
              ...getCommandGlobalOptions(subcommand),
              ...options,
            },
            runtime
          );
          setProcessExitCode(exitCode);
        } catch (error) {
          handleCommandError(error);
        }
      }
    );

  command
    .command('verify')
    .description('Recompute hashes for tracked skills and report drift')
    .option('--toon', 'Emit LLM-friendly TOON output')
    .action(
      async (options: SkillsVerifyCommandOptions, subcommand: Command) => {
        try {
          const exitCode = await runSkillsVerifyCommand(
            {
              ...getCommandGlobalOptions(subcommand),
              ...options,
            },
            runtime
          );
          setProcessExitCode(exitCode);
        } catch (error) {
          handleCommandError(error);
        }
      }
    );

  command
    .command('install')
    .description('Install a skill from a local directory or a repository')
    .option(
      '--path <path>',
      'Path to a local skill directory containing SKILL.md'
    )
    .option(
      '--repo <source>',
      'Local repository path or owner/repo GitHub reference to search for a skill'
    )
    .option(
      '--name <name>',
      'Skill directory name to install when using --repo'
    )
    .option('--force', 'Overwrite an existing installed skill directory')
    .option('--toon', 'Emit LLM-friendly TOON output')
    .action(
      async (options: SkillsInstallCommandOptions, subcommand: Command) => {
        try {
          const exitCode = await runSkillsInstallCommand(
            {
              ...getCommandGlobalOptions(subcommand),
              ...options,
            },
            runtime
          );
          setProcessExitCode(exitCode);
        } catch (error) {
          handleCommandError(error);
        }
      }
    );

  command
    .command('remove <name>')
    .description('Remove an installed skill directory')
    .option(
      '--force',
      'Allow deleting an installed skill directory that is not tracked by the lockfile'
    )
    .option('--toon', 'Emit LLM-friendly TOON output')
    .action(
      async (
        name: string,
        options: SkillsRemoveCommandOptions,
        subcommand: Command
      ) => {
        try {
          const exitCode = await runSkillsRemoveCommand(
            name,
            {
              ...getCommandGlobalOptions(subcommand),
              ...options,
            },
            runtime
          );
          setProcessExitCode(exitCode);
        } catch (error) {
          handleCommandError(error);
        }
      }
    );

  return command;
};
