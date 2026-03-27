import fs from 'node:fs';
import path from 'node:path';

const CONFIG_FILE_NAMES = [
  'dev-cli.config.ts',
  'dev-cli.config.mts',
  'dev-cli.config.js',
  'dev-cli.config.mjs',
] as const;
const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
]);
const LEADING_CURRENT_DIRECTORY_PATTERN = /^\.\//;
const LEADING_SLASHES_PATTERN = /^\/+/;
const NEWLINE_SPLIT_PATTERN = /\r?\n/u;
const WORKSPACE_ITEM_PATTERN = /^\s*-\s*(.+?)\s*$/u;
const TRAILING_SLASHES_PATTERN = /\/+$/;
const WINDOWS_PATH_SEPARATOR_PATTERN = /\\/g;

const normalizeRelativePath = (value: string): string => {
  return value
    .replace(WINDOWS_PATH_SEPARATOR_PATTERN, '/')
    .replace(LEADING_CURRENT_DIRECTORY_PATTERN, '')
    .replace(LEADING_SLASHES_PATTERN, '');
};

const normalizeWorkspacePattern = (pattern: string): string => {
  return normalizeRelativePath(pattern.trim()).replace(
    TRAILING_SLASHES_PATTERN,
    ''
  );
};

const stripQuotedPattern = (value: string): string => {
  const trimmedValue = value.trim();
  if (
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    return trimmedValue.slice(1, -1);
  }

  return trimmedValue;
};

const collectPackageDirectories = (
  rootDir: string,
  currentDir = rootDir,
  directories: string[] = []
): string[] => {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }

      collectPackageDirectories(
        rootDir,
        path.join(currentDir, entry.name),
        directories
      );
      continue;
    }

    if (entry.isFile() && entry.name === 'package.json') {
      directories.push(currentDir);
    }
  }

  return directories;
};

const readJsonFile = <T>(filePath: string): T => {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
};

const readWorkspacePatterns = (workspaceFilePath: string): string[] => {
  const content = fs.readFileSync(workspaceFilePath, 'utf-8');
  const patterns: string[] = [];
  const lines = content.split(NEWLINE_SPLIT_PATTERN);
  let inPackagesBlock = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!inPackagesBlock) {
      if (trimmedLine === 'packages:') {
        inPackagesBlock = true;
      }
      continue;
    }

    if (trimmedLine.length === 0 || trimmedLine.startsWith('#')) {
      continue;
    }

    const itemMatch = line.match(WORKSPACE_ITEM_PATTERN);
    if (itemMatch?.[1]) {
      patterns.push(stripQuotedPattern(itemMatch[1]));
      continue;
    }

    if (!(line.startsWith(' ') || line.startsWith('\t'))) {
      break;
    }
  }

  return patterns;
};

const matchesWorkspacePackagePattern = (
  relativeDirectoryPath: string,
  patterns: string[]
): boolean => {
  const normalizedRelativeDirectoryPath = normalizeRelativePath(
    relativeDirectoryPath
  );
  const includePatterns = patterns
    .filter((pattern) => !stripQuotedPattern(pattern).startsWith('!'))
    .map(normalizeWorkspacePattern);
  const excludePatterns = patterns
    .filter((pattern) => stripQuotedPattern(pattern).startsWith('!'))
    .map((pattern) => normalizeWorkspacePattern(pattern.slice(1)));

  const isIncluded = includePatterns.some((pattern) => {
    return path.matchesGlob(normalizedRelativeDirectoryPath, pattern);
  });

  if (!isIncluded) {
    return false;
  }

  return !excludePatterns.some((pattern) => {
    return path.matchesGlob(normalizedRelativeDirectoryPath, pattern);
  });
};

/**
 * Resolves the dev-launcher manifest path from an explicit path or by searching
 * upward from the current working directory.
 */
export const resolveDevLauncherConfigPath = (options?: {
  configPath?: string;
  cwd?: string;
}): string => {
  const cwd = path.resolve(options?.cwd ?? process.cwd());
  const explicitConfigPath = options?.configPath?.trim();

  if (explicitConfigPath) {
    return path.resolve(cwd, explicitConfigPath);
  }

  let currentDir = cwd;

  while (true) {
    for (const fileName of CONFIG_FILE_NAMES) {
      const candidatePath = path.join(currentDir, fileName);
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  throw new Error(
    `Could not find a dev-cli.config.ts/.mts/.js/.mjs file from ${cwd}. Pass --config to specify it explicitly.`
  );
};

/**
 * Resolves the root directory that owns the dev-launcher manifest.
 */
export const getRepoRootFromConfigPath = (configPath: string): string => {
  return path.dirname(path.resolve(configPath));
};

/**
 * Reads a package.json file and returns its parsed contents.
 */
export const readPackageJson = <T extends { name?: string }>(
  packageJsonPath: string
): T => {
  return readJsonFile<T>(packageJsonPath);
};

/**
 * Reads the pnpm workspace file at the repo root and returns the configured
 * include and exclude patterns. Returns an empty list when the repo is not a
 * PNPM workspace.
 */
export const getPnpmWorkspacePatterns = (repoRoot: string): string[] => {
  const workspaceFilePath = path.join(repoRoot, 'pnpm-workspace.yaml');
  if (!fs.existsSync(workspaceFilePath)) {
    return [];
  }

  return readWorkspacePatterns(workspaceFilePath);
};

/**
 * Lists workspace package directories for the repo root using
 * pnpm-workspace.yaml patterns when present.
 */
export const listWorkspacePackageDirectories = (repoRoot: string): string[] => {
  const workspacePatterns = getPnpmWorkspacePatterns(repoRoot);
  const packageDirectories = collectPackageDirectories(repoRoot).filter(
    (directoryPath) => path.resolve(directoryPath) !== path.resolve(repoRoot)
  );

  if (workspacePatterns.length === 0) {
    return packageDirectories;
  }

  return packageDirectories.filter((directoryPath) => {
    const relativeDirectoryPath = path.relative(repoRoot, directoryPath);
    return matchesWorkspacePackagePattern(
      normalizeRelativePath(relativeDirectoryPath),
      workspacePatterns
    );
  });
};

/**
 * Resolves a workspace package directory by explicit relative path.
 */
export const resolveWorkspacePackageDirectoryByPath = (
  repoRoot: string,
  packagePath: string
): string => {
  const normalizedPackagePath = normalizeRelativePath(packagePath);
  const packageDirectoryPath = path.resolve(repoRoot, normalizedPackagePath);
  const packageJsonPath = path.join(packageDirectoryPath, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(
      `Workspace package path "${normalizedPackagePath}" does not contain a package.json file.`
    );
  }

  return packageDirectoryPath;
};

/**
 * Resolves a workspace package directory by package name. The root package is
 * also considered a valid match when its package.json name matches.
 */
export const resolveWorkspacePackageDirectoryByName = (
  repoRoot: string,
  packageName: string
): string => {
  const rootPackageJsonPath = path.join(repoRoot, 'package.json');
  if (fs.existsSync(rootPackageJsonPath)) {
    const rootPackageJson = readPackageJson<{ name?: string }>(
      rootPackageJsonPath
    );
    if (rootPackageJson.name === packageName) {
      return repoRoot;
    }
  }

  const matchedDirectories = listWorkspacePackageDirectories(repoRoot).filter(
    (directoryPath) => {
      const packageJsonPath = path.join(directoryPath, 'package.json');
      const packageJson = readPackageJson<{ name?: string }>(packageJsonPath);
      return packageJson.name === packageName;
    }
  );

  if (matchedDirectories.length === 0) {
    throw new Error(
      `Could not find a workspace package named "${packageName}".`
    );
  }

  if (matchedDirectories.length > 1) {
    throw new Error(
      `Workspace package name "${packageName}" is ambiguous. Use packagePath instead.`
    );
  }

  return matchedDirectories[0] as string;
};

/**
 * Resolves a command working directory. Relative values are interpreted from
 * the repo root.
 */
export const resolveCommandCwd = (repoRoot: string, cwd?: string): string => {
  if (!cwd) {
    return repoRoot;
  }

  if (path.isAbsolute(cwd)) {
    return cwd;
  }

  return path.resolve(repoRoot, cwd);
};
