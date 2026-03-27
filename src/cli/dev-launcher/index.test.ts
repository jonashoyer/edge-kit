import { describe, expect, it } from 'vitest';
import { gitPullAction } from './actions/git-pull';
import { installDepsAction } from './actions/install-deps';
import { defineDevLauncherConfig } from './config';

describe('dev-launcher shipped actions', () => {
  it('supports composing shipped actions in shared dev configs', () => {
    const config = defineDevLauncherConfig({
      actionsById: {
        'git-pull': gitPullAction,
        'install-deps': installDepsAction,
      },
      packageManager: 'pnpm',
      servicesById: {
        app: {
          label: 'App',
          target: {
            kind: 'root-script',
            script: 'dev',
          },
        },
      },
      version: 1,
    });

    expect(config.actionsById['git-pull']).toBe(gitPullAction);
    expect(config.actionsById['install-deps']).toBe(installDepsAction);
    expect(gitPullAction.label).toBe('Pull latest commits');
    expect(installDepsAction.label).toBe('Install dependencies');
  });
});
