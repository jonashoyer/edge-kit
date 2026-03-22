import { describe, expect, it } from 'vitest';
import { defineDevActions } from './actions';
import { gitPullAction } from './actions/git-pull';
import { installDepsAction } from './actions/install-deps';

describe('dev-launcher shipped actions', () => {
  it('supports composing shipped actions in repo actions configs', () => {
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
