import { describe, expect, it } from 'vitest';
import { defineDevActions, gitPullAction, installDepsAction } from './index';

describe('dev-launcher public entrypoint', () => {
  it('exports shipped actions for repo actions configs', () => {
    const config = defineDevActions({
      actionsById: {
        'git-pull': gitPullAction,
        'install-deps': installDepsAction,
      },
    });

    expect(config.actionsById['git-pull']).toBe(gitPullAction);
    expect(config.actionsById['install-deps']).toBe(installDepsAction);
    expect(gitPullAction.label).toBe('Pull latest commits');
    expect(installDepsAction.label).toBe('Install dependencies');
  });
});
