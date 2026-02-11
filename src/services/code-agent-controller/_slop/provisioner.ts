import type { ProvisioningStepResult, RepoProvisioningContext } from './types';

/**
 * Provisioning interface for preparing a repo environment.
 */
export interface Provisioner {
  provision(context: RepoProvisioningContext): Promise<ProvisioningStepResult>;
  // prepareRepo(context: RepoProvisioningContext): Promise<ProvisioningStepResult>;
  // installDependencies(
  //   context: RepoProvisioningContext
  // ): Promise<ProvisioningStepResult>;
  // bootDevcontainer(
  //   context: RepoProvisioningContext
  // ): Promise<ProvisioningStepResult>;
  // injectEnv(context: EnvInjectionContext): Promise<ProvisioningStepResult>;
}
