/** biome-ignore-all lint/suspicious/noConsole: CLI command output is intentional. */
import { Command } from 'commander';
import type { DevActionSuggestion } from './action-runner';
import { getDevPreflightActionSuggestions } from './action-runner';
import type { LoadedDevActionsConfig } from './actions-config';
import { loadDevActionsConfig } from './actions-config';
import {
  getPresetServiceIds,
  loadDevLauncherManifest,
  normalizeSelectedServiceIds,
} from './manifest';
import { runPlainDevSession } from './plain-runner';
import { startDevLauncherTuiSession } from './tui';
import type { LoadedDevLauncherManifest } from './types';

export interface DevLauncherCommandOptions {
  actionsConfig?: string;
  config?: string;
  noTui?: boolean;
  preset?: string;
  services?: string;
}

export interface DevLauncherCommandRuntime {
  isInteractiveTuiSupported: () => boolean;
  loadManifest: (options?: {
    configPath?: string;
    cwd?: string;
  }) => LoadedDevLauncherManifest;
  loadActionsConfig: (options?: {
    actionsConfigPath?: string;
    cwd?: string;
    optional?: boolean;
  }) => Promise<LoadedDevActionsConfig | null>;
  getPreflightSuggestions: (
    manifest: LoadedDevLauncherManifest,
    actionsConfig: LoadedDevActionsConfig
  ) => Promise<DevActionSuggestion[]>;
  runPlainDevSession: (
    manifest: LoadedDevLauncherManifest,
    initialServiceIds?: string[]
  ) => Promise<number>;
  startDevLauncherTuiSession: (
    manifest: LoadedDevLauncherManifest,
    initialServiceIds?: string[]
  ) => Promise<number>;
  stderr: Pick<NodeJS.WriteStream, 'write'>;
  stdout: Pick<NodeJS.WriteStream, 'write'>;
}

const defaultRuntime: DevLauncherCommandRuntime = {
  isInteractiveTuiSupported: () => {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY);
  },
  getPreflightSuggestions: async (manifest, actionsConfig) => {
    return await getDevPreflightActionSuggestions(manifest, actionsConfig);
  },
  loadActionsConfig: async (options) => {
    return await loadDevActionsConfig(options);
  },
  loadManifest: (options) => loadDevLauncherManifest(options),
  runPlainDevSession: async (manifest, initialServiceIds) => {
    return await runPlainDevSession(manifest, undefined, initialServiceIds);
  },
  startDevLauncherTuiSession: async (manifest, initialServiceIds) => {
    return await startDevLauncherTuiSession(
      manifest,
      undefined,
      initialServiceIds
    );
  },
  stderr: process.stderr,
  stdout: process.stdout,
};

const parseServiceIdsOption = (servicesOption: string): string[] => {
  return servicesOption
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};

/**
 * Resolves the initial service selection from CLI flags. `--services` and
 * `--preset` are mutually exclusive.
 */
export const resolveInitialServiceIds = (
  manifest: LoadedDevLauncherManifest,
  options: DevLauncherCommandOptions
): string[] | undefined => {
  if (options.preset && options.services) {
    throw new Error('Use either --preset or --services, not both.');
  }

  if (options.services) {
    return normalizeSelectedServiceIds(
      manifest,
      parseServiceIdsOption(options.services)
    );
  }

  if (options.preset) {
    return getPresetServiceIds(manifest, options.preset);
  }

  return undefined;
};

/**
 * Runs a dev-launcher session by loading the manifest, resolving any explicit
 * selection flags, and choosing between TUI and plain modes.
 */
export const runDevLauncherCommand = async (
  options: DevLauncherCommandOptions = {},
  runtime: DevLauncherCommandRuntime = defaultRuntime
): Promise<number> => {
  const manifest = runtime.loadManifest({
    configPath: options.config,
  });
  const initialServiceIds = resolveInitialServiceIds(manifest, options);
  const useTui = !options.noTui && runtime.isInteractiveTuiSupported();
  const actionsConfig = await runtime.loadActionsConfig({
    actionsConfigPath: options.actionsConfig,
    optional: true,
  });

  if (actionsConfig) {
    const suggestions = await runtime.getPreflightSuggestions(
      manifest,
      actionsConfig
    );
    for (const suggestion of suggestions) {
      runtime.stdout.write(`${suggestion.message}\n`);
    }
  }

  if (useTui) {
    return await runtime.startDevLauncherTuiSession(
      manifest,
      initialServiceIds
    );
  }

  if (!(options.noTui || runtime.isInteractiveTuiSupported())) {
    runtime.stdout.write(
      'Interactive TTY not available. Falling back to plain mode.\n'
    );
  }

  return await runtime.runPlainDevSession(manifest, initialServiceIds);
};

/**
 * Creates the reusable `dev` command that can be embedded in a repo-level CLI.
 */
export const createDevLauncherCommand = (
  runtime: DevLauncherCommandRuntime = defaultRuntime
): Command => {
  return new Command('dev')
    .description(
      'Launch and supervise local development services from dev-cli.config.json'
    )
    .option('--config <path>', 'Path to a dev-cli.config.json file')
    .option(
      '--actions-config <path>',
      'Path to a dev-cli.actions.ts/.mts/.js/.mjs file'
    )
    .option('--preset <id>', 'Launch a named preset from the manifest')
    .option('--services <ids>', 'Launch a comma-separated list of service ids')
    .option('--no-tui', 'Use the plain runner instead of the Ink TUI')
    .action(async (options: DevLauncherCommandOptions) => {
      try {
        const exitCode = await runDevLauncherCommand(options, runtime);
        if (exitCode !== 0) {
          process.exitCode = exitCode;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exitCode = 1;
      }
    });
};
