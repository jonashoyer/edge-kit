import { execFile } from 'node:child_process';
import path from 'node:path';

const FIELD_SEPARATOR = '\u001f';
const GROUP_SEPARATOR = '\u001d';
const LARGE_BUFFER_SIZE_BYTES = 10 * 1024 * 1024;
const NEWLINE_PATTERN = /\r?\n/u;
const RECORD_SEPARATOR = '\u001e';

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
  fileChanges: GitCommitReportFileChange[];
  filesChanged: number;
  hash: string;
  patch?: string;
  shortHash: string;
  subject: string;
}

export interface CollectGitCommitReportOptions {
  authors: string[];
  cwd?: string;
  includeBody?: boolean;
  includePatch?: boolean;
  since: string;
  until: string;
}

export interface GitCommitReport {
  commits: GitCommitReportEntry[];
  query: {
    authors: string[];
    cwd: string;
    includeBody: boolean;
    includePatch: boolean;
    since: string;
    until: string;
  };
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

  if (normalizedAuthors.length === 0) {
    throw new Error(
      'At least one --author <pattern> value is required to collect commits.'
    );
  }

  return normalizedAuthors;
};

const buildAuthorPattern = (authors: string[]) => {
  return authors.map((author) => `(${author})`).join('|');
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

const parseGitLogOutput = (
  stdout: string,
  options: {
    includeBody: boolean;
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
    const fileChanges = parseFileChanges(rawStats);
    let additions = 0;
    let deletions = 0;

    for (const fileChange of fileChanges) {
      additions += fileChange.additions ?? 0;
      deletions += fileChange.deletions ?? 0;
    }

    commits.push({
      additions,
      authorEmail,
      authorName,
      authoredAt,
      body: options.includeBody && body.length > 0 ? body : undefined,
      deletions,
      fileChanges,
      filesChanged: fileChanges.length,
      hash,
      shortHash,
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
  const includePatch = options.includePatch ?? false;
  const gitLogResult = await runGitCommand(
    [
      'log',
      '--no-color',
      '--no-decorate',
      `--since=${since}`,
      `--until=${until}`,
      `--author=${buildAuthorPattern(authors)}`,
      '--date=iso-strict',
      `--format=${RECORD_SEPARATOR}%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ae${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%b${GROUP_SEPARATOR}`,
      '--numstat',
    ],
    repoCwd,
    runtime
  );
  const commits = parseGitLogOutput(gitLogResult.stdout, {
    includeBody,
  });

  if (includePatch) {
    for (const commit of commits) {
      commit.patch = await getPatchForCommit(commit.hash, repoCwd, runtime);
    }
  }

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
    query: {
      authors,
      cwd: repoCwd,
      includeBody,
      includePatch,
      since,
      until,
    },
    totalAdditions,
    totalCommits: commits.length,
    totalDeletions,
    totalFilesChanged,
  };
};

/**
 * Formats a report for human-readable CLI output.
 */
export const formatGitCommitReport = (report: GitCommitReport): string => {
  if (report.commits.length === 0) {
    return 'No commits matched the supplied filters.';
  }

  const lines = [
    `Found ${report.totalCommits} commits for ${report.query.authors.join(', ')} between ${report.query.since} and ${report.query.until}.`,
    `Totals: ${report.totalFilesChanged} files changed, +${report.totalAdditions}, -${report.totalDeletions}.`,
  ];

  for (const commit of report.commits) {
    lines.push('');
    lines.push(
      `- ${commit.shortHash} | ${commit.authoredAt} | ${commit.authorName} <${commit.authorEmail}>`
    );
    lines.push(`  ${commit.subject}`);
    lines.push(
      `  Files: ${commit.filesChanged} | +${commit.additions} | -${commit.deletions}`
    );

    for (const fileChange of commit.fileChanges) {
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
  }

  return lines.join('\n');
};
