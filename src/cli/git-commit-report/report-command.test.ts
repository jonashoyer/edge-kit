import { describe, expect, it, vi } from 'vitest';
import { formatGitCommitReport } from './report';
import {
  type GitCommitReportCommandRuntime,
  runGitCommitReportCommand,
} from './report-command';

const RECORD_SEPARATOR = '\u001e';
const FIELD_SEPARATOR = '\u001f';
const GROUP_SEPARATOR = '\u001d';

const createGitLogOutput = (options?: { includeFileChanges?: boolean }) => {
  if (options?.includeFileChanges) {
    return [
      `${RECORD_SEPARATOR}0123456789abcdef${FIELD_SEPARATOR}0123456${FIELD_SEPARATOR}Alice Example${FIELD_SEPARATOR}alice@example.com${FIELD_SEPARATOR}2026-03-18T10:00:00+01:00${FIELD_SEPARATOR}feat(cli): add commit report (#123)${FIELD_SEPARATOR}body line 1\nbody line 2${GROUP_SEPARATOR}`,
      '12\t3\tsrc/cli/git-commit-report/report-command.ts',
      '1\t0\tREADME.md',
      `${RECORD_SEPARATOR}fedcba9876543210${FIELD_SEPARATOR}fedcba9${FIELD_SEPARATOR}Bob Example${FIELD_SEPARATOR}bob@example.com${FIELD_SEPARATOR}2026-03-17T09:30:00+01:00${FIELD_SEPARATOR}fix(cli): tighten parsing${FIELD_SEPARATOR}${GROUP_SEPARATOR}`,
      '4\t1\tsrc/cli/git-commit-report/report.ts',
    ].join('\n');
  }

  return [
    `${RECORD_SEPARATOR}0123456789abcdef${FIELD_SEPARATOR}0123456${FIELD_SEPARATOR}Alice Example${FIELD_SEPARATOR}alice@example.com${FIELD_SEPARATOR}2026-03-18T10:00:00+01:00${FIELD_SEPARATOR}feat(cli): add commit report (#123)${FIELD_SEPARATOR}body line 1\nbody line 2${GROUP_SEPARATOR}`,
    ' 2 files changed, 13 insertions(+), 3 deletions(-)',
    `${RECORD_SEPARATOR}fedcba9876543210${FIELD_SEPARATOR}fedcba9${FIELD_SEPARATOR}Bob Example${FIELD_SEPARATOR}bob@example.com${FIELD_SEPARATOR}2026-03-17T09:30:00+01:00${FIELD_SEPARATOR}fix(cli): tighten parsing${FIELD_SEPARATOR}${GROUP_SEPARATOR}`,
    ' 1 file changed, 4 insertions(+), 1 deletion(-)',
  ].join('\n');
};

const createRuntime = (): {
  execFile: ReturnType<typeof vi.fn>;
  runtime: GitCommitReportCommandRuntime;
  stdout: { write: ReturnType<typeof vi.fn> };
} => {
  const execFile = vi.fn();
  const stdout = {
    write: vi.fn(),
  };

  return {
    execFile,
    runtime: {
      gitRuntime: {
        cwd: '/repo',
        execFile,
      },
      stderr: process.stderr,
      stdout: stdout as unknown as NodeJS.WriteStream,
    },
    stdout,
  };
};

describe('runGitCommitReportCommand', () => {
  it('writes formatted commit output without author or file filters by default', async () => {
    const { execFile, runtime, stdout } = createRuntime();
    execFile
      .mockResolvedValueOnce({
        stderr: '',
        stdout: createGitLogOutput(),
      })
      .mockResolvedValueOnce({
        stderr: '',
        stdout: 'git@github.com:openai/edge-kit.git\n',
      });

    await runGitCommitReportCommand(
      {
        since: '2026-03-17',
        until: '2026-03-19',
      },
      runtime
    );

    const logArgs = execFile.mock.calls[0]?.[1] as string[];
    const output = stdout.write.mock.calls[0]?.[0] as string;

    expect(execFile).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining([
        'log',
        '--no-color',
        '--no-decorate',
        '--shortstat',
        '--date=iso-strict',
        '--since=2026-03-17',
        '--until=2026-03-19',
      ]),
      expect.objectContaining({
        cwd: '/repo',
      })
    );
    expect(
      logArgs.some((argument) => argument.startsWith('--author='))
    ).toBeFalsy();
    expect(output).toContain(
      'Found 2 commits for all authors between 2026-03-17 and 2026-03-19.'
    );
    expect(output).toContain('Pull requests: 1 detected.');
    expect(output).not.toContain('src/cli/git-commit-report/report-command.ts');
  });

  it('emits TOON output when requested', async () => {
    const { execFile, runtime, stdout } = createRuntime();
    execFile
      .mockResolvedValueOnce({
        stderr: '',
        stdout: createGitLogOutput(),
      })
      .mockResolvedValueOnce({
        stderr: '',
        stdout: 'https://github.com/openai/edge-kit.git\n',
      });

    await runGitCommitReportCommand(
      {
        author: ['alice@example.com'],
        since: '2026-03-17',
        toon: true,
        until: '2026-03-19',
      },
      runtime
    );

    const output = stdout.write.mock.calls[0]?.[0];
    expect(typeof output).toBe('string');
    expect(output).toContain('totalCommits: 2');
    expect(output).toContain('pullRequest:');
    expect(output).toContain('number: 123');
    expect(output).toContain('includeFileChanges: false');
    expect(output).toContain('https://github.com/openai/edge-kit/pull/123');
  });

  it('includes body, patch, and file rows when explicitly requested', async () => {
    const { execFile, runtime, stdout } = createRuntime();
    execFile
      .mockResolvedValueOnce({
        stderr: '',
        stdout: createGitLogOutput({
          includeFileChanges: true,
        }),
      })
      .mockResolvedValueOnce({
        stderr: '',
        stdout: 'git@github.com:openai/edge-kit.git\n',
      })
      .mockResolvedValueOnce({
        stderr: '',
        stdout: 'diff --git a/file b/file\n+added line\n',
      })
      .mockResolvedValueOnce({
        stderr: '',
        stdout: 'diff --git a/other b/other\n-changed line\n',
      });

    await runGitCommitReportCommand(
      {
        author: ['alice@example.com'],
        body: true,
        files: true,
        patch: true,
        since: '2026-03-17',
        until: '2026-03-19',
      },
      runtime
    );

    expect(execFile).toHaveBeenNthCalledWith(
      1,
      'git',
      expect.arrayContaining(['--numstat']),
      expect.objectContaining({
        cwd: '/repo',
      })
    );
    expect(execFile).toHaveBeenNthCalledWith(
      2,
      'git',
      ['remote', 'get-url', 'origin'],
      expect.objectContaining({
        cwd: '/repo',
      })
    );
    expect(execFile).toHaveBeenNthCalledWith(
      3,
      'git',
      [
        'show',
        '--format=',
        '--no-color',
        '--no-ext-diff',
        '--patch',
        '0123456789abcdef',
      ],
      expect.objectContaining({
        cwd: '/repo',
      })
    );
    expect(stdout.write).toHaveBeenCalledWith(
      expect.stringContaining('body line 1')
    );
    expect(stdout.write).toHaveBeenCalledWith(
      expect.stringContaining('diff --git a/file b/file')
    );
    expect(stdout.write).toHaveBeenCalledWith(
      expect.stringContaining(
        'src/cli/git-commit-report/report-command.ts (+12 -3)'
      )
    );
  });
});

describe('formatGitCommitReport', () => {
  it('prints a friendly message when no commits match', () => {
    expect(
      formatGitCommitReport({
        commits: [],
        query: {
          authors: [],
          cwd: '/repo',
          includeBody: false,
          includeFileChanges: false,
          includePatch: false,
          since: '2026-03-17',
          until: '2026-03-19',
        },
        pullRequests: [],
        totalAdditions: 0,
        totalCommits: 0,
        totalDeletions: 0,
        totalFilesChanged: 0,
      })
    ).toBe('No commits matched the supplied filters.');
  });
});
