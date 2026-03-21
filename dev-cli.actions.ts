import { installDepsAction } from './dev-cli/actions/install-deps';
import { defineDevActions } from './src/cli/dev-launcher';

export default defineDevActions({
  actionsById: {
    'install-deps': installDepsAction,
  },
});
