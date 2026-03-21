import type { LoadedDevLauncherManifest } from './types';

export type DevActionImpactPolicy = 'parallel' | 'stop-all' | 'stop-selected';

export interface DevActionAvailabilityResult {
  available: boolean;
  reason?: string;
}

export interface DevActionExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  rejectOnNonZero?: boolean;
  stdio?: 'inherit' | 'pipe';
}

export interface DevActionExecResult {
  args: string[];
  command: string;
  cwd: string;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface DevActionLogger {
  error: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
}

export interface DevActionOutput {
  write: (value: string) => void;
  writeLine: (value: string) => void;
}

export interface DevActionContext {
  actionsConfigPath: string;
  configPath: string;
  cwd: string;
  exec: (
    command: string,
    args?: string[],
    options?: DevActionExecOptions
  ) => Promise<DevActionExecResult>;
  logger: DevActionLogger;
  manifest: LoadedDevLauncherManifest;
  output: DevActionOutput;
  pnpm: (
    args?: string[],
    options?: Omit<DevActionExecOptions, 'cwd'> & {
      cwd?: string;
    }
  ) => Promise<DevActionExecResult>;
  repoRoot: string;
}

export interface DevActionRunResult {
  summary?: string;
}

export type DevActionAvailabilityCheck = (
  context: DevActionContext
) =>
  | boolean
  | DevActionAvailabilityResult
  | Promise<boolean | DevActionAvailabilityResult>;

export interface DevActionDefinition {
  description?: string;
  impactPolicy: DevActionImpactPolicy;
  isAvailable?: DevActionAvailabilityCheck;
  label: string;
  run: (
    context: DevActionContext
  ) => Promise<DevActionRunResult | undefined> | DevActionRunResult | undefined;
  suggestInDev?: boolean;
}

export interface DevActionsConfigDefinition {
  actionsById: Record<string, DevActionDefinition>;
}

/**
 * Defines a typed registry of one-shot developer actions for the dev launcher.
 */
export const defineDevActions = (
  config: DevActionsConfigDefinition
): DevActionsConfigDefinition => config;
