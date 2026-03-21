import type { DevActionDefinition } from '../../src/cli/dev-launcher';
import { getPnpmInstallState } from '../../src/cli/dev-launcher';

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
