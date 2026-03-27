import { gitPullAction } from './src/cli/dev-launcher/actions/git-pull';
import { installDepsAction } from './src/cli/dev-launcher/actions/install-deps';
import { defineDevLauncherConfig } from './src/cli/dev-launcher/config';

export default defineDevLauncherConfig({
  actionsById: {
    'git-pull': gitPullAction,
    'install-deps': installDepsAction,
  },
  packageManager: 'pnpm',
  servicesById: {
    tests: {
      description: 'Run Vitest in watch mode',
      label: 'Tests',
      target: {
        kind: 'root-script',
        script: 'test',
      },
    },
  },
  ui: {
    logBufferLines: 240,
  },
  version: 1,
});
