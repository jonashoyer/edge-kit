import type { AbstractLogger } from "../../logging/abstract-logger";
import type {
  EnvInjectionContext,
  ProvisioningStepResult,
  RepoProvisioningContext,
} from "../types";
import type { EnvInjector } from "./env-injector";
import type { Provisioner } from "./provisioner";

export interface SshCommandOptions {
  cwd?: string;
  stdin?: string;
  env?: Record<string, string>;
}

export interface SshCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SshExecutor {
  exec(command: string, options?: SshCommandOptions): Promise<SshCommandResult>;
}

export interface SshProvisionerConfig {
  executor: SshExecutor;
  envInjector: EnvInjector;
  repoPath: string;
  logger?: AbstractLogger;
}

/**
 * Provisioner implementation that executes commands over SSH.
 */
export class SshProvisioner implements Provisioner {
  private executor: SshExecutor;
  private envInjector: EnvInjector;
  private repoPath: string;
  private logger?: AbstractLogger;

  constructor(config: SshProvisionerConfig) {
    this.executor = config.executor;
    this.envInjector = config.envInjector;
    this.repoPath = config.repoPath;
    this.logger = config.logger;
  }

  async prepareRepo(
    context: RepoProvisioningContext
  ): Promise<ProvisioningStepResult> {
    const command = `if [ -d "${this.repoPath}/.git" ]; then git -C "${this.repoPath}" fetch --all && git -C "${this.repoPath}" checkout "${context.branch}" && git -C "${this.repoPath}" pull; else git clone --branch "${context.branch}" "${context.repoUrl}" "${this.repoPath}"; fi`;
    return this.runStep("prepare-repo", command);
  }

  async installDependencies(
    _context: RepoProvisioningContext
  ): Promise<ProvisioningStepResult> {
    const command = `cd "${this.repoPath}" && pnpm install`;
    return this.runStep("pnpm-install", command);
  }

  async bootDevcontainer(
    _context: RepoProvisioningContext
  ): Promise<ProvisioningStepResult> {
    const command = `cd "${this.repoPath}" && devcontainer up --remove-existing-container`;
    return this.runStep("devcontainer-up", command);
  }

  async injectEnv(
    context: EnvInjectionContext
  ): Promise<ProvisioningStepResult> {
    const start = Date.now();
    try {
      const envVars = await this.envInjector.decryptPayload(context.envPayload);
      const envFile = this.envInjector.formatEnvFile(envVars);
      const command = `cd "${this.repoPath}" && cat > .env`;
      const result = await this.executor.exec(command, { stdin: envFile });
      if (result.exitCode !== 0) {
        throw new Error(result.stderr || "env injection failed");
      }
      return {
        step: "inject-env",
        ok: true,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        step: "inject-env",
        ok: false,
        durationMs: Date.now() - start,
        error: error instanceof Error ? error.message : "env injection failed",
      };
    }
  }

  private async runStep(
    step: string,
    command: string
  ): Promise<ProvisioningStepResult> {
    const start = Date.now();
    try {
      const result = await this.executor.exec(command);
      if (result.exitCode !== 0) {
        throw new Error(result.stderr || `${step} failed`);
      }
      this.logger?.info(`Provisioning step ${step} succeeded`, {
        step,
      });
      return {
        step,
        ok: true,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      this.logger?.warn(`Provisioning step ${step} failed`, {
        step,
        error: error instanceof Error ? error.message : "unknown error",
      });
      return {
        step,
        ok: false,
        durationMs: Date.now() - start,
        error: error instanceof Error ? error.message : "unknown error",
      };
    }
  }
}
