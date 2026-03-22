import type { DevActionContext, DevActionDefinition } from '../actions';

type GitPullState =
  | {
      branch: string;
      reason: string;
      status: 'ahead';
      upstream: string;
    }
  | {
      branch: string;
      behindCount: number;
      reason: string;
      status: 'behind';
      upstream: string;
    }
  | {
      branch: string;
      reason: string;
      status: 'diverged';
      upstream: string;
    }
  | {
      reason: string;
      status: 'detached-head' | 'no-upstream' | 'up-to-date';
    };

const COMPARE_COUNT_REGEXP = /\s+/;

const formatCommitCount = (count: number): string => {
  return `${count} commit${count === 1 ? '' : 's'}`;
};

const getCurrentBranchName = async (
  context: DevActionContext
): Promise<string | null> => {
  const result = await context.exec('git', ['branch', '--show-current']);
  const branchName = result.stdout.trim();
  return branchName.length > 0 ? branchName : null;
};

const getCurrentUpstream = async (
  context: DevActionContext
): Promise<string | null> => {
  const result = await context.exec(
    'git',
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    {
      rejectOnNonZero: false,
    }
  );

  if (result.exitCode !== 0) {
    return null;
  }

  const upstream = result.stdout.trim();
  return upstream.length > 0 ? upstream : null;
};

const parseAheadBehindCounts = (
  stdout: string
): {
  aheadCount: number;
  behindCount: number;
} => {
  const [aheadValue, behindValue] = stdout.trim().split(COMPARE_COUNT_REGEXP);
  const aheadCount = Number.parseInt(aheadValue ?? '', 10);
  const behindCount = Number.parseInt(behindValue ?? '', 10);

  if (Number.isNaN(aheadCount) || Number.isNaN(behindCount)) {
    throw new Error('Git ahead/behind output was not parseable.');
  }

  return {
    aheadCount,
    behindCount,
  };
};

const getGitPullState = async (
  context: DevActionContext,
  options?: {
    refreshRemote?: boolean;
  }
): Promise<GitPullState> => {
  const branch = await getCurrentBranchName(context);
  if (!branch) {
    return {
      reason: 'Git HEAD is detached.',
      status: 'detached-head',
    };
  }

  const upstream = await getCurrentUpstream(context);
  if (!upstream) {
    return {
      reason: `${branch} has no upstream branch configured.`,
      status: 'no-upstream',
    };
  }

  if (options?.refreshRemote) {
    await context.exec('git', ['fetch', '--quiet']);
  }

  const comparisonResult = await context.exec('git', [
    'rev-list',
    '--left-right',
    '--count',
    `HEAD...${upstream}`,
  ]);
  const { aheadCount, behindCount } = parseAheadBehindCounts(
    comparisonResult.stdout
  );

  if (aheadCount === 0 && behindCount === 0) {
    return {
      reason: `${branch} is already up to date with ${upstream}.`,
      status: 'up-to-date',
    };
  }

  if (aheadCount === 0) {
    return {
      behindCount,
      branch,
      reason: `${upstream} is ahead of ${branch} by ${formatCommitCount(behindCount)}.`,
      status: 'behind',
      upstream,
    };
  }

  if (behindCount === 0) {
    return {
      branch,
      reason: `${branch} is ahead of ${upstream} by ${formatCommitCount(aheadCount)}.`,
      status: 'ahead',
      upstream,
    };
  }

  return {
    branch,
    reason: `${branch} has diverged from ${upstream} (${formatCommitCount(aheadCount)} ahead, ${formatCommitCount(behindCount)} behind).`,
    status: 'diverged',
    upstream,
  };
};

export const gitPullAction: DevActionDefinition = {
  description:
    'Fetch the tracked remote branch and fast-forward pull when the current branch is behind.',
  impactPolicy: 'stop-all',
  async isAvailable(context) {
    try {
      const state = await getGitPullState(context, {
        refreshRemote: true,
      });

      return {
        available: state.status === 'behind',
        reason: state.reason,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        available: false,
        reason: `Could not inspect git pull state. ${message}`,
      };
    }
  },
  label: 'Pull latest commits',
  async run(context) {
    const state = await getGitPullState(context, {
      refreshRemote: true,
    });

    switch (state.status) {
      case 'up-to-date':
      case 'ahead':
        return {
          summary: state.reason,
        };
      case 'detached-head':
      case 'no-upstream':
        throw new Error(state.reason);
      case 'diverged':
        throw new Error(
          `${state.reason} Resolve the branch state manually before pulling.`
        );
      case 'behind':
        await context.exec('git', ['pull', '--ff-only'], {
          stdio: 'inherit',
        });

        return {
          summary: `Pulled ${formatCommitCount(state.behindCount)} from ${state.upstream}.`,
        };
      default:
        state satisfies never;
        throw new Error('Unhandled git pull state.');
    }
  },
};
