import { execFile } from 'node:child_process';
import path from 'node:path';
import { encode } from '@toon-format/toon';

const FIELD_SEPARATOR = '\u001f';
const FILES_CHANGED_PATTERN = /(\d+) files? changed/u;
const GROUP_SEPARATOR = '\u001d';
const GITHUB_REMOTE_PATTERN = /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?$/u;
const INSERTIONS_PATTERN = /(\d+) insertions?\(\+\)/u;
const LARGE_BUFFER_SIZE_BYTES = 10 * 1024 * 1024;
const MERGE_PULL_REQUEST_PATTERN = /^Merge pull request #(\d+)\b/u;
const NEWLINE_PATTERN = /\r?\n/u;
const RECORD_SEPARATOR = '\u001e';
const DELETIONS_PATTERN = /(\d+) deletions?\(-\)/u;
const SQUASH_PULL_REQUEST_PATTERN = /\s+\(#(\d+)\)$/u;

export interface GitCommitReportFileChange {
  additions: number | null;
  deletions: number | null;
  isBinary: boolean;
  path: string;
}

export interface GitCommitReportEntry {
  additions: number;
  authorEmail: string;
  authorName: string;
  authoredAt: string;
  body?: string;
  deletions: number;
  fileChanges?: GitCommitReportFileChange[];
  filesChanged: number;
  hash: string;
  patch?: string;
  pullRequest?: GitCommitReportPullRequestReference;
  shortHash: string;
  subject: string;
}

export interface CollectGitCommitReportOptions {
  authors: string[];
  cwd?: string;
  includeBody?: boolean;
  includeFileChanges?: boolean;
  includePatch?: boolean;
  since: string;
  until: string;
}

export interface GitCommitReportPullRequestReference {
  number: number;
  title: string;
  url?: string;
}

export interface GitCommitReportPullRequest
  extends GitCommitReportPullRequestReference {
  authorEmail: string;
  authorName: string;
  authoredAt: string;
  hash: string;
  shortHash: string;
}

export interface GitCommitReport {
  commits: GitCommitReportEntry[];
  pullRequests: GitCommitReportPullRequest[];
  query: {
    authors: string[];
    cwd: string;
    includeBody: boolean;
    includeFileChanges: boolean;
    includePatch: boolean;
    since: string;
    until: string;
  };
  repository?: string;
  totalAdditions: number;
  totalCommits: number;
  totalDeletions: number;
  totalFilesChanged: number;
}

interface ExecFileOptions {
  cwd: string;
  maxBuffer: number;
}

interface ExecFileResult {
  stderr: string;
  stdout: string;
}

export interface GitCommitReportRuntime {
  cwd: string;
  execFile: (
    file: string,
    args: string[],
    options: ExecFileOptions
  ) => Promise<ExecFileResult>;
}

interface GitExecError extends Error {
  stderr?: string;
}

export const defaultGitCommitReportRuntime: GitCommitReportRuntime = {
  cwd: process.cwd(),
  execFile: async (file, args, options) => {
    return await new Promise<ExecFileResult>((resolve, reject) => {
      execFile(file, args, options, (error, stdout, stderr) => {
        if (error) {
          const gitError = error as GitExecError;
          gitError.stderr = stderr;
          reject(gitError);
          return;
        }

        resolve({
          stderr,
          stdout,
        });
      });
    });
  },
};

const ensureNonEmptyValue = (value: string | undefined, flagName: string) => {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    throw new Error(`Missing required option ${flagName}.`);
  }

  return normalizedValue;
};

const normalizeAuthorPatterns = (authors: string[]) => {
  const normalizedAuthors = authors
    .map((author) => author.trim())
    .filter((author) => author.length > 0);
  return normalizedAuthors;
};

const buildAuthorPattern = (authors: string[]) => {
  return authors.map((author) => `\\(${author}\\)`).join('\\|');
};

const parseStatValue = (value: string) => {
  if (value === '-') {
    return null;
  }

  const parsedValue = Number(value);
  if (Number.isNaN(parsedValue)) {
    throw new Error(`Failed to parse git numstat value "${value}".`);
  }

  return parsedValue;
};

const parseFileChanges = (rawStats: string): GitCommitReportFileChange[] => {
  const trimmedStats = rawStats.trim();
  if (trimmedStats.length === 0) {
    return [];
  }

  const fileChanges: GitCommitReportFileChange[] = [];

  for (const rawLine of trimmedStats.split(NEWLINE_PATTERN)) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }

    const segments = rawLine.split('\t');
    if (segments.length < 3) {
      continue;
    }

    const additions = parseStatValue(segments[0] ?? '');
    const deletions = parseStatValue(segments[1] ?? '');
    const filePath = segments.slice(2).join('\t').trim();

    fileChanges.push({
      additions,
      deletions,
      isBinary: additions === null || deletions === null,
      path: filePath,
    });
  }

  return fileChanges;
};

const parseShortStatSummary = (rawStats: string) => {
  const trimmedStats = rawStats.trim();
  if (trimmedStats.length === 0) {
    return {
      additions: 0,
      deletions: 0,
      filesChanged: 0,
    };
  }

  const statLine = trimmedStats
    .split(NEWLINE_PATTERN)
    .map((line) => line.trim())
    .find((line) => FILES_CHANGED_PATTERN.test(line));

  if (!statLine) {
    return {
      additions: 0,
      deletions: 0,
      filesChanged: 0,
    };
  }

  const filesChangedMatch = statLine.match(FILES_CHANGED_PATTERN);
  const additionsMatch = statLine.match(INSERTIONS_PATTERN);
  const deletionsMatch = statLine.match(DELETIONS_PATTERN);

  return {
    additions: Number(additionsMatch?.[1] ?? 0),
    deletions: Number(deletionsMatch?.[1] ?? 0),
    filesChanged: Number(filesChangedMatch?.[1] ?? 0),
  };
};

const getMergeCommitTitle = (body: string) => {
  return body
    .split(NEWLINE_PATTERN)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
};

const buildPullRequestUrl = (
  repository: string | undefined,
  pullRequestNumber: number
) => {
  if (!repository) {
    return undefined;
  }

  return `https://github.com/${repository}/pull/${pullRequestNumber}`;
};

const detectPullRequestReference = (
  subject: string,
  body: string,
  repository: string | undefined
): GitCommitReportPullRequestReference | undefined => {
  const squashMatch = subject.match(SQUASH_PULL_REQUEST_PATTERN);
  if (squashMatch) {
    const pullRequestNumber = Number(squashMatch[1]);
    return {
      number: pullRequestNumber,
      title: subject.replace(SQUASH_PULL_REQUEST_PATTERN, '').trim(),
      url: buildPullRequestUrl(repository, pullRequestNumber),
    };
  }

  const mergeMatch = subject.match(MERGE_PULL_REQUEST_PATTERN);
  if (!mergeMatch) {
    return undefined;
  }

  const pullRequestNumber = Number(mergeMatch[1]);
  return {
    number: pullRequestNumber,
    title: getMergeCommitTitle(body) ?? subject,
    url: buildPullRequestUrl(repository, pullRequestNumber),
  };
};

const parseGitLogOutput = (
  stdout: string,
  options: {
    includeBody: boolean;
    includeFileChanges: boolean;
    repository?: string;
  }
): GitCommitReportEntry[] => {
  const commits: GitCommitReportEntry[] = [];
  const rawBlocks = stdout
    .split(RECORD_SEPARATOR)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  for (const rawBlock of rawBlocks) {
    const metadataEndIndex = rawBlock.indexOf(GROUP_SEPARATOR);
    if (metadataEndIndex < 0) {
      throw new Error('Failed to parse git commit metadata.');
    }

    const metadata = rawBlock.slice(0, metadataEndIndex);
    const rawStats = rawBlock.slice(metadataEndIndex + GROUP_SEPARATOR.length);
    const fields = metadata.split(FIELD_SEPARATOR);

    if (fields.length < 7) {
      throw new Error('Failed to parse git commit metadata fields.');
    }

    const [hash, shortHash, authorName, authorEmail, authoredAt, subject] =
      fields;
    const body = fields.slice(6).join(FIELD_SEPARATOR).trim();
    const pullRequest = detectPullRequestReference(
      subject,
      body,
      options.repository
    );
    const fileChanges = options.includeFileChanges
      ? parseFileChanges(rawStats)
      : undefined;
    const shortStatSummary = options.includeFileChanges
      ? undefined
      : parseShortStatSummary(rawStats);
    const additions =
      fileChanges?.reduce((total, fileChange) => {
        return total + (fileChange.additions ?? 0);
      }, 0) ??
      shortStatSummary?.additions ??
      0;
    const deletions =
      fileChanges?.reduce((total, fileChange) => {
        return total + (fileChange.deletions ?? 0);
      }, 0) ??
      shortStatSummary?.deletions ??
      0;

    commits.push({
      additions,
      authorEmail,
      authorName,
      authoredAt,
      body: options.includeBody && body.length > 0 ? body : undefined,
      deletions,
      fileChanges,
      filesChanged: fileChanges?.length ?? shortStatSummary?.filesChanged ?? 0,
      hash,
      shortHash,
      pullRequest,
      subject,
    });
  }

  return commits;
};

const toIndentedBlock = (value: string) => {
  return value
    .split(NEWLINE_PATTERN)
    .map((line) => `  ${line}`)
    .join('\n');
};

const getPatchForCommit = async (
  hash: string,
  cwd: string,
  runtime: GitCommitReportRuntime
) => {
  const result = await runtime.execFile(
    'git',
    ['show', '--format=', '--no-color', '--no-ext-diff', '--patch', hash],
    {
      cwd,
      maxBuffer: LARGE_BUFFER_SIZE_BYTES,
    }
  );

  return result.stdout.trimEnd();
};

const resolveGitHubRepository = async (
  cwd: string,
  runtime: GitCommitReportRuntime
) => {
  try {
    const result = await runGitCommand(
      ['remote', 'get-url', 'origin'],
      cwd,
      runtime
    );
    const remote = result.stdout.trim();
    const match = remote.match(GITHUB_REMOTE_PATTERN);

    return match?.[1];
  } catch {
    return undefined;
  }
};

const collectPullRequests = (commits: GitCommitReportEntry[]) => {
  const pullRequests = new Map<number, GitCommitReportPullRequest>();

  for (const commit of commits) {
    if (!commit.pullRequest || pullRequests.has(commit.pullRequest.number)) {
      continue;
    }

    pullRequests.set(commit.pullRequest.number, {
      authorEmail: commit.authorEmail,
      authorName: commit.authorName,
      authoredAt: commit.authoredAt,
      hash: commit.hash,
      number: commit.pullRequest.number,
      shortHash: commit.shortHash,
      title: commit.pullRequest.title,
      url: commit.pullRequest.url,
    });
  }

  return [...pullRequests.values()];
};

const runGitCommand = async (
  args: string[],
  cwd: string,
  runtime: GitCommitReportRuntime
) => {
  try {
    return await runtime.execFile('git', args, {
      cwd,
      maxBuffer: LARGE_BUFFER_SIZE_BYTES,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stderr =
      error instanceof Error &&
      'stderr' in error &&
      typeof error.stderr === 'string'
        ? error.stderr.trim()
        : '';

    throw new Error(stderr.length > 0 ? stderr : message);
  }
};

/**
 * Collects committed git history for the supplied authors and date range.
 */
export const collectGitCommitReport = async (
  options: CollectGitCommitReportOptions,
  runtime: GitCommitReportRuntime = defaultGitCommitReportRuntime
): Promise<GitCommitReport> => {
  const authors = normalizeAuthorPatterns(options.authors);
  const since = ensureNonEmptyValue(options.since, '--since');
  const until = ensureNonEmptyValue(options.until, '--until');
  const repoCwd = path.resolve(runtime.cwd, options.cwd ?? '.');
  const includeBody = options.includeBody ?? false;
  const includeFileChanges = options.includeFileChanges ?? false;
  const includePatch = options.includePatch ?? false;
  const gitLogArgs = [
    'log',
    '--no-color',
    '--no-decorate',
    `--since=${since}`,
    `--until=${until}`,
    '--date=iso-strict',
    `--format=${RECORD_SEPARATOR}%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ae${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%b${GROUP_SEPARATOR}`,
    includeFileChanges ? '--numstat' : '--shortstat',
  ];

  if (authors.length > 0) {
    gitLogArgs.splice(5, 0, `--author=${buildAuthorPattern(authors)}`);
  }

  const gitLogResult = await runGitCommand(gitLogArgs, repoCwd, runtime);
  const repository = gitLogResult.stdout.includes('#')
    ? await resolveGitHubRepository(repoCwd, runtime)
    : undefined;
  const commits = parseGitLogOutput(gitLogResult.stdout, {
    includeBody,
    includeFileChanges,
    repository,
  });

  if (includePatch) {
    for (const commit of commits) {
      commit.patch = await getPatchForCommit(commit.hash, repoCwd, runtime);
    }
  }

  const pullRequests = collectPullRequests(commits);
  let totalAdditions = 0;
  let totalDeletions = 0;
  let totalFilesChanged = 0;

  for (const commit of commits) {
    totalAdditions += commit.additions;
    totalDeletions += commit.deletions;
    totalFilesChanged += commit.filesChanged;
  }

  return {
    commits,
    pullRequests,
    query: {
      authors,
      cwd: repoCwd,
      includeBody,
      includeFileChanges,
      includePatch,
      since,
      until,
    },
    repository,
    totalAdditions,
    totalCommits: commits.length,
    totalDeletions,
    totalFilesChanged,
  };
};

const formatPullRequestLines = (pullRequests: GitCommitReportPullRequest[]) => {
  if (pullRequests.length === 0) {
    return [];
  }

  const lines = [`Pull requests: ${pullRequests.length} detected.`];

  for (const pullRequest of pullRequests) {
    lines.push(
      `  #${pullRequest.number} | ${pullRequest.authoredAt} | ${pullRequest.title}`
    );
  }

  return lines;
};

const formatCommitLines = (commit: GitCommitReportEntry) => {
  const lines = [
    `- ${commit.shortHash} | ${commit.authoredAt} | ${commit.authorName} <${commit.authorEmail}>`,
    `  ${commit.subject}`,
  ];

  if (commit.pullRequest) {
    lines.push(
      `  PR: #${commit.pullRequest.number} | ${commit.pullRequest.title}`
    );
  }

  lines.push(
    `  Files: ${commit.filesChanged} | +${commit.additions} | -${commit.deletions}`
  );

  for (const fileChange of commit.fileChanges ?? []) {
    const additions =
      fileChange.additions === null ? 'binary' : `+${fileChange.additions}`;
    const deletions =
      fileChange.deletions === null ? 'binary' : `-${fileChange.deletions}`;
    lines.push(`  ${fileChange.path} (${additions} ${deletions})`);
  }

  if (commit.body) {
    lines.push('  Body:');
    lines.push(toIndentedBlock(commit.body));
  }

  if (commit.patch) {
    lines.push('  Patch:');
    lines.push(toIndentedBlock(commit.patch));
  }

  return lines;
};

/**
 * Formats a report for human-readable CLI output.
 */
export const formatGitCommitReport = (report: GitCommitReport): string => {
  if (report.commits.length === 0) {
    return 'No commits matched the supplied filters.';
  }

  const authorSummary =
    report.query.authors.length > 0
      ? report.query.authors.join(', ')
      : 'all authors';
  const lines = [
    `Found ${report.totalCommits} commits for ${authorSummary} between ${report.query.since} and ${report.query.until}.`,
    `Totals: ${report.totalFilesChanged} files changed, +${report.totalAdditions}, -${report.totalDeletions}.`,
  ];

  lines.push(...formatPullRequestLines(report.pullRequests));

  for (const commit of report.commits) {
    lines.push('');
    lines.push(...formatCommitLines(commit));
  }

  return lines.join('\n');
};

/**
 * Formats a report as TOON for LLM-friendly CLI output.
 */
export const formatGitCommitReportToon = (report: GitCommitReport): string => {
  return encode(report);
};
