import {
  defineDevActions,
  gitPullAction,
  installDepsAction,
} from './src/cli/dev-launcher';

export default defineDevActions({
  actionsById: {
    'git-pull': gitPullAction,
    'install-deps': installDepsAction,
  },
});
