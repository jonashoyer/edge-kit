import type { DevActionDefinition } from '../actions';
import { getPnpmInstallState } from '../package-state';

export const installDepsAction: DevActionDefinition = {
  description:
    'Run pnpm install when the workspace install marker is missing or stale.',
  impactPolicy: 'stop-all',
  async isAvailable(context) {
    const installState = getPnpmInstallState(context.repoRoot);
    return {
      available: installState.needsInstall,
      reason: installState.reason,
    };
  },
  label: 'Install dependencies',
  async run(context) {
    const installState = getPnpmInstallState(context.repoRoot);
    if (!installState.needsInstall) {
      return {
        summary: 'Dependencies already look current.',
      };
    }

    await context.pnpm(['install'], {
      stdio: 'inherit',
    });
    return {
      summary: 'Dependencies installed.',
    };
  },
  suggestInDev: true,
};
