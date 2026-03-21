import { describe, expect, it, vi } from 'vitest';
import {
  formatGitCommitReport,
  type GitCommitReportCommandRuntime,
  runGitCommitReportCommand,
} from './index';

const RECORD_SEPARATOR = '\u001e';
const FIELD_SEPARATOR = '\u001f';
const GROUP_SEPARATOR = '\u001d';

const createGitLogOutput = () => {
  return [
    `${RECORD_SEPARATOR}0123456789abcdef${FIELD_SEPARATOR}0123456${FIELD_SEPARATOR}Alice Example${FIELD_SEPARATOR}alice@example.com${FIELD_SEPARATOR}2026-03-18T10:00:00+01:00${FIELD_SEPARATOR}feat(cli): add commit report${FIELD_SEPARATOR}body line 1\nbody line 2${GROUP_SEPARATOR}`,
    '12\t3\tsrc/cli/git-commit-report/report-command.ts',
    '1\t0\tREADME.md',
    `${RECORD_SEPARATOR}fedcba9876543210${FIELD_SEPARATOR}fedcba9${FIELD_SEPARATOR}Bob Example${FIELD_SEPARATOR}bob@example.com${FIELD_SEPARATOR}2026-03-17T09:30:00+01:00${FIELD_SEPARATOR}fix(cli): tighten parsing${FIELD_SEPARATOR}${GROUP_SEPARATOR}`,
    '4\t1\tsrc/cli/git-commit-report/report.ts',
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
  it('writes formatted commit output for matching commits', async () => {
    const { execFile, runtime, stdout } = createRuntime();
    execFile.mockResolvedValueOnce({
      stderr: '',
      stdout: createGitLogOutput(),
    });

    await runGitCommitReportCommand(
      {
        author: ['alice@example.com', 'bob@example.com'],
        since: '2026-03-17',
        until: '2026-03-19',
      },
      runtime
    );

    expect(execFile).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining([
        'log',
        '--no-color',
        '--no-decorate',
        '--numstat',
        '--date=iso-strict',
        '--since=2026-03-17',
        '--until=2026-03-19',
        '--author=(alice@example.com)|(bob@example.com)',
      ]),
      expect.objectContaining({
        cwd: '/repo',
      })
    );
    expect(stdout.write).toHaveBeenCalledWith(
      expect.stringContaining(
        'Found 2 commits for alice@example.com, bob@example.com between 2026-03-17 and 2026-03-19.'
      )
    );
    expect(stdout.write).toHaveBeenCalledWith(
      expect.stringContaining(
        'src/cli/git-commit-report/report-command.ts (+12 -3)'
      )
    );
  });

  it('emits JSON output when requested', async () => {
    const { execFile, runtime, stdout } = createRuntime();
    execFile.mockResolvedValueOnce({
      stderr: '',
      stdout: createGitLogOutput(),
    });

    await runGitCommitReportCommand(
      {
        author: ['alice@example.com'],
        json: true,
        since: '2026-03-17',
        until: '2026-03-19',
      },
      runtime
    );

    const output = stdout.write.mock.calls[0]?.[0];
    expect(typeof output).toBe('string');

    const parsedOutput = JSON.parse(output as string) as {
      commits: Array<{ body?: string; hash: string }>;
      totalAdditions: number;
      totalCommits: number;
    };

    expect(parsedOutput.totalCommits).toBe(2);
    expect(parsedOutput.totalAdditions).toBe(17);
    expect(parsedOutput.commits[0]?.body).toBeUndefined();
    expect(parsedOutput.commits[0]?.hash).toBe('0123456789abcdef');
  });

  it('includes body and patch output when explicitly requested', async () => {
    const { execFile, runtime, stdout } = createRuntime();
    execFile
      .mockResolvedValueOnce({
        stderr: '',
        stdout: createGitLogOutput(),
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
        patch: true,
        since: '2026-03-17',
        until: '2026-03-19',
      },
      runtime
    );

    expect(execFile).toHaveBeenNthCalledWith(
      2,
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
  });

  it('requires at least one author filter', async () => {
    const { runtime } = createRuntime();

    await expect(
      runGitCommitReportCommand(
        {
          since: '2026-03-17',
          until: '2026-03-19',
        },
        runtime
      )
    ).rejects.toThrow(
      'At least one --author <pattern> value is required to collect commits.'
    );
  });
});

describe('formatGitCommitReport', () => {
  it('prints a friendly message when no commits match', () => {
    expect(
      formatGitCommitReport({
        commits: [],
        query: {
          authors: ['alice@example.com'],
          cwd: '/repo',
          includeBody: false,
          includePatch: false,
          since: '2026-03-17',
          until: '2026-03-19',
        },
        totalAdditions: 0,
        totalCommits: 0,
        totalDeletions: 0,
        totalFilesChanged: 0,
      })
    ).toBe('No commits matched the supplied filters.');
  });
});
