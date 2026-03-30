/** biome-ignore-all lint/suspicious/noConsole: CLI command output is intentional. */
import { Command } from 'commander';
import {
  collectGitCommitReport,
  defaultGitCommitReportRuntime,
  formatGitCommitReport,
  formatGitCommitReportToon,
  type GitCommitReportRuntime,
} from './report';

const collectOptionValues = (value: string, previous?: string[]) => {
  return [...(previous ?? []), value];
};

export interface GitCommitReportCommandOptions {
  author?: string[];
  body?: boolean;
  cwd?: string;
  files?: boolean;
  patch?: boolean;
  since?: string;
  toon?: boolean;
  until?: string;
}

export interface GitCommitReportCommandRuntime {
  gitRuntime: GitCommitReportRuntime;
  stderr: Pick<NodeJS.WriteStream, 'write'>;
  stdout: Pick<NodeJS.WriteStream, 'write'>;
}

const defaultRuntime: GitCommitReportCommandRuntime = {
  gitRuntime: defaultGitCommitReportRuntime,
  stderr: process.stderr,
  stdout: process.stdout,
};

const normalizeAuthorOption = (author: string[] | undefined) => {
  return author ?? [];
};

/**
 * Runs the git commit report command and writes TOON or formatted text.
 */
export const runGitCommitReportCommand = async (
  options: GitCommitReportCommandOptions,
  runtime: GitCommitReportCommandRuntime = defaultRuntime
): Promise<number> => {
  const report = await collectGitCommitReport(
    {
      authors: normalizeAuthorOption(options.author),
      cwd: options.cwd,
      includeBody: options.body,
      includeFileChanges: options.files,
      includePatch: options.patch,
      since: options.since ?? '',
      until: options.until ?? '',
    },
    runtime.gitRuntime
  );

  if (options.toon) {
    runtime.stdout.write(`${formatGitCommitReportToon(report)}\n`);
    return 0;
  }

  runtime.stdout.write(`${formatGitCommitReport(report)}\n`);
  return 0;
};

/**
 * Creates the reusable `commits` command family for git history reporting.
 */
export const createGitCommitReportCommand = (
  runtime: GitCommitReportCommandRuntime = defaultRuntime
): Command => {
  const command = new Command('commits').description(
    'Collect git commit history reports for optional authors and explicit time ranges'
  );

  command
    .command('report')
    .description(
      'Report committed history for optional author filters within an explicit time range'
    )
    .requiredOption('--since <value>', 'Lower date bound passed through to git')
    .requiredOption('--until <value>', 'Upper date bound passed through to git')
    .option(
      '--author <pattern>',
      'Git author regex to match; repeat to include multiple authors',
      collectOptionValues
    )
    .option('--cwd <path>', 'Run git in a specific repository directory')
    .option('--toon', 'Emit LLM-friendly TOON output')
    .option('--body', 'Include commit message bodies in the output')
    .option('--files', 'Include per-file change rows in the output')
    .option('--patch', 'Include full per-commit patches in the output')
    .action(async (options: GitCommitReportCommandOptions) => {
      try {
        const exitCode = await runGitCommitReportCommand(options, runtime);
        if (exitCode !== 0) {
          process.exitCode = exitCode;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
        process.exitCode = 1;
      }
    });

  return command;
};
