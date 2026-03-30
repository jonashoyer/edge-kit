import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encode } from '@toon-format/toon';
import { normalizeRelativePath } from '../../utils/path-utils';

const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const LARGE_BUFFER_SIZE_BYTES = 10 * 1024 * 1024;
const LOCKFILE_NAME = 'skills-lock.json';
const SAFE_SKILL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const SKILL_FILE_NAME = 'SKILL.md';
const SKILL_LAYOUT_DIRECTORIES = ['.agents/skills', '.codex/skills'] as const;
const TEMPORARY_INSTALL_PREFIX = '.tmp-install-';

export type SkillSourceType = 'github' | 'local';
export type SkillsTree = 'agents' | 'codex';

export interface SkillsCommandGlobalOptions {
  root?: string;
  tree?: SkillsTree;
}

export interface SkillsInfoCommandOptions extends SkillsCommandGlobalOptions {
  toon?: boolean;
}

export interface SkillsInstallCommandOptions
  extends SkillsCommandGlobalOptions {
  force?: boolean;
  name?: string;
  path?: string;
  repo?: string;
  toon?: boolean;
}

export interface SkillsListCommandOptions extends SkillsCommandGlobalOptions {
  toon?: boolean;
}

export interface SkillsRemoveCommandOptions extends SkillsCommandGlobalOptions {
  force?: boolean;
  toon?: boolean;
}

export interface SkillsVerifyCommandOptions extends SkillsCommandGlobalOptions {
  toon?: boolean;
}

interface ExecFileOptions {
  cwd: string;
  maxBuffer: number;
}

interface ExecFileResult {
  stderr: string;
  stdout: string;
}

interface ExecFileError extends Error {
  stderr?: string;
}

export interface SkillsCommandRuntime {
  cwd: string;
  execFile: (
    file: string,
    args: string[],
    options: ExecFileOptions
  ) => Promise<ExecFileResult>;
  homeDir: string;
  stdout: Pick<NodeJS.WriteStream, 'write'>;
}

export interface SkillsLockfileEntry {
  computedHash: string;
  source: string;
  sourceSubpath?: string;
  sourceType: SkillSourceType;
}

export interface SkillsLockfile {
  skills: Record<string, SkillsLockfileEntry>;
  version: 1;
}

export interface SkillsListEntry {
  installed: boolean;
  name: string;
  path: string;
  source?: string;
  sourceType?: SkillSourceType;
  status: 'missing' | 'tracked' | 'untracked';
  tracked: boolean;
}

export interface SkillsInfoResult {
  actualHash?: string;
  expectedHash?: string;
  installed: boolean;
  name: string;
  path: string;
  source?: string;
  sourceSubpath?: string;
  sourceType?: SkillSourceType;
  status: 'drifted' | 'missing' | 'tracked' | 'untracked';
  tracked: boolean;
}

export interface SkillsInstallResult {
  computedHash: string;
  name: string;
  path: string;
  source: string;
  sourceSubpath?: string;
  sourceType: SkillSourceType;
}

export interface SkillsRemoveResult {
  name: string;
  path: string;
  removedFromDisk: boolean;
  removedFromLockfile: boolean;
}

export interface SkillsVerifyEntry {
  actualHash?: string;
  expectedHash: string;
  name: string;
  path: string;
  source: string;
  sourceSubpath?: string;
  sourceType: SkillSourceType;
  status: 'drifted' | 'missing' | 'ok';
}

export interface SkillsVerifyResult {
  root: string;
  skills: SkillsVerifyEntry[];
}

interface ResolvedSkillSource {
  cleanup?: () => void;
  skillName: string;
  skillPath: string;
  source: string;
  sourceSubpath?: string;
  sourceType: SkillSourceType;
}

const createDefaultRuntime = (): SkillsCommandRuntime => ({
  cwd: process.cwd(),
  execFile: async (file, args, options) => {
    return await new Promise<ExecFileResult>((resolve, reject) => {
      execFile(file, args, options, (error, stdout, stderr) => {
        if (error) {
          const execError = error as ExecFileError;
          execError.stderr = stderr;
          reject(execError);
          return;
        }

        resolve({
          stderr,
          stdout,
        });
      });
    });
  },
  homeDir: os.homedir(),
  stdout: process.stdout,
});

export const defaultSkillsCommandRuntime = createDefaultRuntime();

const createEmptyLockfile = (): SkillsLockfile => ({
  skills: {},
  version: 1,
});

const ensureDirectoryExists = (directoryPath: string): void => {
  fs.mkdirSync(directoryPath, { recursive: true });
};

const ensureNonEmptyValue = (
  value: string | undefined,
  flagName: string
): string => {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    throw new Error(`Missing required option ${flagName}.`);
  }

  return normalizedValue;
};

const normalizeTreeOption = (tree: SkillsTree | undefined): SkillsTree => {
  if (tree === undefined) {
    return 'codex';
  }

  if (tree === 'agents' || tree === 'codex') {
    return tree;
  }

  throw new Error(
    `Unsupported skills tree "${String(tree)}". Expected "codex" or "agents".`
  );
};

const assertSafeSkillName = (name: string): string => {
  const normalizedName = name.trim();

  if (!SAFE_SKILL_NAME_PATTERN.test(normalizedName)) {
    throw new Error(
      `Invalid skill name "${name}". Use letters, numbers, ".", "_" or "-".`
    );
  }

  return normalizedName;
};

const getSkillsLockfilePath = (rootDirectoryPath: string): string => {
  return path.join(rootDirectoryPath, LOCKFILE_NAME);
};

const isExistingDirectory = (directoryPath: string): boolean => {
  try {
    return fs.statSync(directoryPath).isDirectory();
  } catch {
    return false;
  }
};

const isExistingFile = (filePath: string): boolean => {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
};

const isSkillDirectory = (directoryPath: string): boolean => {
  return (
    isExistingDirectory(directoryPath) &&
    isExistingFile(path.join(directoryPath, SKILL_FILE_NAME))
  );
};

const ensureSkillDirectory = (directoryPath: string, label: string): string => {
  const resolvedDirectoryPath = path.resolve(directoryPath);
  if (!isSkillDirectory(resolvedDirectoryPath)) {
    throw new Error(
      `${label} must resolve to a directory containing ${SKILL_FILE_NAME}.`
    );
  }

  return resolvedDirectoryPath;
};

const writeToon = (runtime: SkillsCommandRuntime, value: unknown): void => {
  runtime.stdout.write(`${encode(value)}\n`);
};

const sortLockfileSkills = (
  skills: Record<string, SkillsLockfileEntry>
): Record<string, SkillsLockfileEntry> => {
  return Object.fromEntries(
    Object.entries(skills)
      .sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
      .map(([name, entry]) => [
        name,
        {
          computedHash: entry.computedHash,
          source: entry.source,
          ...(entry.sourceSubpath
            ? { sourceSubpath: entry.sourceSubpath }
            : {}),
          sourceType: entry.sourceType,
        },
      ])
  );
};

export const readSkillsLockfile = (
  rootDirectoryPath: string
): SkillsLockfile => {
  const lockfilePath = getSkillsLockfilePath(rootDirectoryPath);
  if (!isExistingFile(lockfilePath)) {
    return createEmptyLockfile();
  }

  const rawValue = JSON.parse(
    fs.readFileSync(lockfilePath, 'utf-8')
  ) as Partial<SkillsLockfile>;

  if (rawValue.version !== 1 || typeof rawValue.skills !== 'object') {
    throw new Error(`Unsupported lockfile format at ${lockfilePath}.`);
  }

  return {
    skills: sortLockfileSkills(
      rawValue.skills as Record<string, SkillsLockfileEntry>
    ),
    version: 1,
  };
};

export const writeSkillsLockfile = (
  rootDirectoryPath: string,
  lockfile: SkillsLockfile
): void => {
  ensureDirectoryExists(rootDirectoryPath);
  fs.writeFileSync(
    getSkillsLockfilePath(rootDirectoryPath),
    `${JSON.stringify(
      {
        skills: sortLockfileSkills(lockfile.skills),
        version: 1,
      },
      null,
      2
    )}\n`
  );
};

const collectInstalledSkillDirectories = (
  rootDirectoryPath: string
): Map<string, string> => {
  if (!isExistingDirectory(rootDirectoryPath)) {
    return new Map();
  }

  const installedSkills = new Map<string, string>();
  const entries = fs
    .readdirSync(rootDirectoryPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((leftEntry, rightEntry) =>
      leftEntry.name.localeCompare(rightEntry.name)
    );

  for (const entry of entries) {
    if (
      entry.name.startsWith('.') ||
      entry.name.startsWith(TEMPORARY_INSTALL_PREFIX)
    ) {
      continue;
    }

    const skillDirectoryPath = path.join(rootDirectoryPath, entry.name);
    if (!isSkillDirectory(skillDirectoryPath)) {
      continue;
    }

    installedSkills.set(entry.name, skillDirectoryPath);
  }

  return installedSkills;
};

export const computeSkillDirectoryHash = (
  skillDirectoryPath: string
): string => {
  const resolvedDirectoryPath = ensureSkillDirectory(
    skillDirectoryPath,
    'Skill directory'
  );
  const hash = crypto.createHash('sha256');

  const walkDirectory = (
    currentDirectoryPath: string,
    currentRelativePath?: string
  ): void => {
    const entries = fs
      .readdirSync(currentDirectoryPath, { withFileTypes: true })
      .sort((leftEntry, rightEntry) =>
        leftEntry.name.localeCompare(rightEntry.name)
      );

    for (const entry of entries) {
      const entryPath = path.join(currentDirectoryPath, entry.name);
      const entryRelativePath = normalizeRelativePath(
        currentRelativePath
          ? path.join(currentRelativePath, entry.name)
          : entry.name
      );
      const stat = fs.lstatSync(entryPath);

      if (stat.isSymbolicLink()) {
        throw new Error(
          `Skills CLI does not support symlinks: ${entryRelativePath}`
        );
      }

      if (stat.isDirectory()) {
        hash.update(`dir:${entryRelativePath}\n`);
        walkDirectory(entryPath, entryRelativePath);
        continue;
      }

      if (stat.isFile()) {
        hash.update(`file:${entryRelativePath}\n`);
        hash.update(fs.readFileSync(entryPath));
        hash.update('\n');
        continue;
      }

      throw new Error(
        `Unsupported filesystem entry in skill directory: ${entryRelativePath}`
      );
    }
  };

  walkDirectory(resolvedDirectoryPath);

  return hash.digest('hex');
};

const copySkillDirectory = (
  sourceDirectoryPath: string,
  destinationDirectoryPath: string,
  currentRelativePath = ''
): void => {
  const sourceDirectory = ensureSkillDirectory(
    sourceDirectoryPath,
    'Skill source'
  );

  const copyDirectoryContents = (
    currentSourceDirectoryPath: string,
    currentDestinationDirectoryPath: string,
    currentDirectoryRelativePath: string
  ): void => {
    ensureDirectoryExists(currentDestinationDirectoryPath);
    const entries = fs
      .readdirSync(currentSourceDirectoryPath, { withFileTypes: true })
      .sort((leftEntry, rightEntry) =>
        leftEntry.name.localeCompare(rightEntry.name)
      );

    for (const entry of entries) {
      const sourceEntryPath = path.join(currentSourceDirectoryPath, entry.name);
      const destinationEntryPath = path.join(
        currentDestinationDirectoryPath,
        entry.name
      );
      const entryRelativePath = normalizeRelativePath(
        currentDirectoryRelativePath
          ? path.join(currentDirectoryRelativePath, entry.name)
          : entry.name
      );
      const stat = fs.lstatSync(sourceEntryPath);

      if (stat.isSymbolicLink()) {
        throw new Error(
          `Skills CLI does not support symlinks: ${entryRelativePath}`
        );
      }

      if (stat.isDirectory()) {
        copyDirectoryContents(
          sourceEntryPath,
          destinationEntryPath,
          entryRelativePath
        );
        continue;
      }

      if (stat.isFile()) {
        fs.copyFileSync(sourceEntryPath, destinationEntryPath);
        fs.chmodSync(destinationEntryPath, stat.mode);
        continue;
      }

      throw new Error(
        `Unsupported filesystem entry in skill directory: ${entryRelativePath}`
      );
    }
  };

  copyDirectoryContents(
    sourceDirectory,
    destinationDirectoryPath,
    currentRelativePath
  );
};

const resolveSkillsRoot = (
  options: SkillsCommandGlobalOptions,
  runtime: SkillsCommandRuntime
): string => {
  const explicitRoot = options.root?.trim();
  if (explicitRoot) {
    return path.resolve(runtime.cwd, explicitRoot);
  }

  const tree = normalizeTreeOption(options.tree);
  const rootDirectoryName = tree === 'agents' ? '.agents' : '.codex';
  return path.join(runtime.homeDir, rootDirectoryName, 'skills');
};

const runCommand = async (
  runtime: SkillsCommandRuntime,
  command: string,
  args: string[],
  cwd: string
): Promise<ExecFileResult> => {
  try {
    return await runtime.execFile(command, args, {
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

const resolveSkillDirectoryFromRepository = (
  repositoryRootPath: string,
  skillName: string
): {
  skillPath: string;
  sourceSubpath: string;
} => {
  for (const layoutDirectory of SKILL_LAYOUT_DIRECTORIES) {
    const skillSubpath = normalizeRelativePath(
      path.join(layoutDirectory, skillName)
    );
    const candidatePath = path.join(repositoryRootPath, skillSubpath);

    if (!isSkillDirectory(candidatePath)) {
      continue;
    }

    return {
      skillPath: candidatePath,
      sourceSubpath: skillSubpath,
    };
  }

  throw new Error(
    `Could not find skill "${skillName}" in ${repositoryRootPath}. Checked ${SKILL_LAYOUT_DIRECTORIES.map(
      (layoutDirectory) =>
        `"${normalizeRelativePath(path.join(layoutDirectory, skillName))}"`
    ).join(', ')}.`
  );
};

const resolvePathInstallSource = (
  skillDirectoryPath: string
): ResolvedSkillSource => {
  const resolvedSkillDirectoryPath = ensureSkillDirectory(
    skillDirectoryPath,
    'Option --path'
  );
  const skillName = assertSafeSkillName(
    path.basename(resolvedSkillDirectoryPath)
  );

  return {
    skillName,
    skillPath: resolvedSkillDirectoryPath,
    source: resolvedSkillDirectoryPath,
    sourceType: 'local',
  };
};

const resolveLocalRepositoryInstallSource = (
  repositoryRootPath: string,
  skillName: string
): ResolvedSkillSource => {
  const resolvedRepositoryRootPath = path.resolve(repositoryRootPath);
  const { skillPath, sourceSubpath } = resolveSkillDirectoryFromRepository(
    resolvedRepositoryRootPath,
    skillName
  );

  return {
    skillName,
    skillPath,
    source: resolvedRepositoryRootPath,
    sourceSubpath,
    sourceType: 'local',
  };
};

const resolveRepositoryInstallSource = async (
  repositoryReference: string,
  skillName: string,
  runtime: SkillsCommandRuntime
): Promise<ResolvedSkillSource> => {
  const resolvedRepositoryPath = path.resolve(runtime.cwd, repositoryReference);

  if (isExistingDirectory(resolvedRepositoryPath)) {
    return resolveLocalRepositoryInstallSource(
      resolvedRepositoryPath,
      skillName
    );
  }

  if (!GITHUB_REPOSITORY_PATTERN.test(repositoryReference)) {
    throw new Error(
      `Option --repo must be a local repository path or an owner/repo GitHub reference. Received "${repositoryReference}".`
    );
  }

  const temporaryRepositoryPath = fs.mkdtempSync(
    path.join(os.tmpdir(), 'edge-kit-skills-repo-')
  );

  try {
    await runCommand(
      runtime,
      'git',
      [
        'clone',
        '--depth=1',
        `https://github.com/${repositoryReference}.git`,
        temporaryRepositoryPath,
      ],
      runtime.cwd
    );

    const { skillPath, sourceSubpath } = resolveSkillDirectoryFromRepository(
      temporaryRepositoryPath,
      skillName
    );

    return {
      cleanup: () => {
        fs.rmSync(temporaryRepositoryPath, {
          force: true,
          recursive: true,
        });
      },
      skillName,
      skillPath,
      source: repositoryReference,
      sourceSubpath,
      sourceType: 'github',
    };
  } catch (error) {
    fs.rmSync(temporaryRepositoryPath, {
      force: true,
      recursive: true,
    });
    throw error;
  }
};

const resolveInstallSource = async (
  options: SkillsInstallCommandOptions,
  runtime: SkillsCommandRuntime
): Promise<ResolvedSkillSource> => {
  const hasPath =
    typeof options.path === 'string' && options.path.trim().length > 0;
  const hasRepo =
    typeof options.repo === 'string' && options.repo.trim().length > 0;

  if (hasPath === hasRepo) {
    throw new Error(
      'Provide exactly one source: either --path <skill-directory> or --repo <path-or-owner/repo>.'
    );
  }

  if (hasPath) {
    if (options.name) {
      throw new Error('Option --name is only supported together with --repo.');
    }

    return resolvePathInstallSource(
      path.resolve(runtime.cwd, options.path ?? '')
    );
  }

  const skillName = assertSafeSkillName(
    ensureNonEmptyValue(options.name, '--name')
  );
  return await resolveRepositoryInstallSource(
    ensureNonEmptyValue(options.repo, '--repo'),
    skillName,
    runtime
  );
};

const getSkillListStatus = (
  installed: boolean,
  tracked: boolean
): SkillsListEntry['status'] => {
  if (!installed) {
    return 'missing';
  }

  if (tracked) {
    return 'tracked';
  }

  return 'untracked';
};

const collectSkillListEntries = (
  rootDirectoryPath: string
): SkillsListEntry[] => {
  const installedSkills = collectInstalledSkillDirectories(rootDirectoryPath);
  const lockfile = readSkillsLockfile(rootDirectoryPath);
  const skillNames = new Set([
    ...installedSkills.keys(),
    ...Object.keys(lockfile.skills),
  ]);

  return Array.from(skillNames)
    .sort((leftName, rightName) => leftName.localeCompare(rightName))
    .map((name) => {
      const installedSkillPath = installedSkills.get(name);
      const trackedEntry = lockfile.skills[name];
      const installed = installedSkillPath !== undefined;
      const tracked = trackedEntry !== undefined;

      return {
        installed,
        name,
        path: installedSkillPath ?? path.join(rootDirectoryPath, name),
        source: trackedEntry?.source,
        sourceType: trackedEntry?.sourceType,
        status: getSkillListStatus(installed, tracked),
        tracked,
      } satisfies SkillsListEntry;
    });
};

const getSkillInfoStatus = (
  installed: boolean,
  lockfileEntry: SkillsLockfileEntry | undefined,
  actualHash: string | undefined
): SkillsInfoResult['status'] => {
  if (!installed) {
    return 'missing';
  }

  if (lockfileEntry === undefined) {
    return 'untracked';
  }

  return actualHash === lockfileEntry.computedHash ? 'tracked' : 'drifted';
};

const collectSkillInfoResult = (
  name: string,
  rootDirectoryPath: string
): SkillsInfoResult => {
  const skillName = assertSafeSkillName(name);
  const lockfile = readSkillsLockfile(rootDirectoryPath);
  const lockfileEntry = lockfile.skills[skillName];
  const skillDirectoryPath = path.join(rootDirectoryPath, skillName);
  const installed = isSkillDirectory(skillDirectoryPath);

  if (!(installed || lockfileEntry)) {
    throw new Error(
      `Skill "${skillName}" is not installed in ${rootDirectoryPath}.`
    );
  }

  const actualHash = installed
    ? computeSkillDirectoryHash(skillDirectoryPath)
    : undefined;
  const status = getSkillInfoStatus(installed, lockfileEntry, actualHash);

  return {
    actualHash,
    expectedHash: lockfileEntry?.computedHash,
    installed,
    name: skillName,
    path: skillDirectoryPath,
    source: lockfileEntry?.source,
    sourceSubpath: lockfileEntry?.sourceSubpath,
    sourceType: lockfileEntry?.sourceType,
    status,
    tracked: lockfileEntry !== undefined,
  };
};

export const collectSkillsVerifyResult = (
  rootDirectoryPath: string
): SkillsVerifyResult => {
  const lockfile = readSkillsLockfile(rootDirectoryPath);
  const skills = Object.entries(lockfile.skills)
    .sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
    .map(([name, entry]) => {
      const skillDirectoryPath = path.join(rootDirectoryPath, name);

      if (!isSkillDirectory(skillDirectoryPath)) {
        return {
          expectedHash: entry.computedHash,
          name,
          path: skillDirectoryPath,
          source: entry.source,
          sourceSubpath: entry.sourceSubpath,
          sourceType: entry.sourceType,
          status: 'missing',
        } satisfies SkillsVerifyEntry;
      }

      const actualHash = computeSkillDirectoryHash(skillDirectoryPath);

      return {
        actualHash,
        expectedHash: entry.computedHash,
        name,
        path: skillDirectoryPath,
        source: entry.source,
        sourceSubpath: entry.sourceSubpath,
        sourceType: entry.sourceType,
        status: actualHash === entry.computedHash ? 'ok' : 'drifted',
      } satisfies SkillsVerifyEntry;
    });

  return {
    root: rootDirectoryPath,
    skills,
  };
};

export const runSkillsListCommand = async (
  options: SkillsListCommandOptions = {},
  runtime: SkillsCommandRuntime = defaultSkillsCommandRuntime
): Promise<number> => {
  const rootDirectoryPath = resolveSkillsRoot(options, runtime);
  const skills = collectSkillListEntries(rootDirectoryPath);

  if (options.toon) {
    writeToon(runtime, {
      root: rootDirectoryPath,
      skills,
    });
    return 0;
  }

  if (skills.length === 0) {
    runtime.stdout.write(
      `No installed skills found in ${rootDirectoryPath}.\n`
    );
    return 0;
  }

  runtime.stdout.write(`Skills root: ${rootDirectoryPath}\n`);

  for (const skill of skills) {
    const sourceSuffix =
      skill.source && skill.sourceType
        ? ` (${skill.sourceType}: ${skill.source})`
        : '';
    runtime.stdout.write(`${skill.status} ${skill.name}${sourceSuffix}\n`);
  }

  return 0;
};

export const runSkillsInfoCommand = async (
  name: string,
  options: SkillsInfoCommandOptions = {},
  runtime: SkillsCommandRuntime = defaultSkillsCommandRuntime
): Promise<number> => {
  const rootDirectoryPath = resolveSkillsRoot(options, runtime);
  const info = collectSkillInfoResult(name, rootDirectoryPath);

  if (options.toon) {
    writeToon(runtime, info);
    return 0;
  }

  runtime.stdout.write(`Skill: ${info.name}\n`);
  runtime.stdout.write(`Status: ${info.status}\n`);
  runtime.stdout.write(`Path: ${info.path}\n`);
  runtime.stdout.write(`Managed: ${info.tracked ? 'yes' : 'no'}\n`);

  if (info.source && info.sourceType) {
    runtime.stdout.write(`Source: ${info.sourceType} ${info.source}\n`);
  }

  if (info.sourceSubpath) {
    runtime.stdout.write(`Source Subpath: ${info.sourceSubpath}\n`);
  }

  if (info.expectedHash) {
    runtime.stdout.write(`Expected Hash: ${info.expectedHash}\n`);
  }

  if (info.actualHash) {
    runtime.stdout.write(`Actual Hash: ${info.actualHash}\n`);
  }

  return 0;
};

export const runSkillsVerifyCommand = async (
  options: SkillsVerifyCommandOptions = {},
  runtime: SkillsCommandRuntime = defaultSkillsCommandRuntime
): Promise<number> => {
  const rootDirectoryPath = resolveSkillsRoot(options, runtime);
  const result = collectSkillsVerifyResult(rootDirectoryPath);

  if (options.toon) {
    writeToon(runtime, result);
    return 0;
  }

  if (result.skills.length === 0) {
    runtime.stdout.write(`No tracked skills found in ${rootDirectoryPath}.\n`);
    return 0;
  }

  runtime.stdout.write(
    `Verified ${result.skills.length} tracked skills in ${rootDirectoryPath}.\n`
  );

  for (const skill of result.skills) {
    const actualHashSuffix = skill.actualHash
      ? ` actual=${skill.actualHash}`
      : '';
    runtime.stdout.write(
      `${skill.status} ${skill.name} expected=${skill.expectedHash}${actualHashSuffix}\n`
    );
  }

  return 0;
};

export const runSkillsInstallCommand = async (
  options: SkillsInstallCommandOptions,
  runtime: SkillsCommandRuntime = defaultSkillsCommandRuntime
): Promise<number> => {
  const rootDirectoryPath = resolveSkillsRoot(options, runtime);
  const resolvedSource = await resolveInstallSource(options, runtime);
  const destinationPath = path.join(
    rootDirectoryPath,
    resolvedSource.skillName
  );
  const stageRootPath = (() => {
    ensureDirectoryExists(rootDirectoryPath);
    return fs.mkdtempSync(
      path.join(rootDirectoryPath, TEMPORARY_INSTALL_PREFIX)
    );
  })();
  const stagedSkillPath = path.join(stageRootPath, resolvedSource.skillName);

  try {
    if (fs.existsSync(destinationPath) && !options.force) {
      throw new Error(
        `Skill "${resolvedSource.skillName}" already exists at ${destinationPath}. Pass --force to overwrite it.`
      );
    }

    copySkillDirectory(resolvedSource.skillPath, stagedSkillPath);
    const computedHash = computeSkillDirectoryHash(stagedSkillPath);

    if (fs.existsSync(destinationPath)) {
      fs.rmSync(destinationPath, {
        force: true,
        recursive: true,
      });
    }

    fs.renameSync(stagedSkillPath, destinationPath);
    const lockfile = readSkillsLockfile(rootDirectoryPath);
    lockfile.skills[resolvedSource.skillName] = {
      computedHash,
      source: resolvedSource.source,
      ...(resolvedSource.sourceSubpath
        ? { sourceSubpath: resolvedSource.sourceSubpath }
        : {}),
      sourceType: resolvedSource.sourceType,
    };
    writeSkillsLockfile(rootDirectoryPath, lockfile);

    const result = {
      computedHash,
      name: resolvedSource.skillName,
      path: destinationPath,
      source: resolvedSource.source,
      sourceSubpath: resolvedSource.sourceSubpath,
      sourceType: resolvedSource.sourceType,
    } satisfies SkillsInstallResult;

    if (options.toon) {
      writeToon(runtime, result);
      return 0;
    }

    runtime.stdout.write(
      `Installed skill "${result.name}" into ${result.path} from ${result.sourceType} source ${result.source}.\n`
    );
    return 0;
  } finally {
    fs.rmSync(stageRootPath, {
      force: true,
      recursive: true,
    });
    resolvedSource.cleanup?.();
  }
};

export const runSkillsRemoveCommand = async (
  name: string,
  options: SkillsRemoveCommandOptions = {},
  runtime: SkillsCommandRuntime = defaultSkillsCommandRuntime
): Promise<number> => {
  const rootDirectoryPath = resolveSkillsRoot(options, runtime);
  const skillName = assertSafeSkillName(name);
  const lockfile = readSkillsLockfile(rootDirectoryPath);
  const isTracked = lockfile.skills[skillName] !== undefined;
  const skillDirectoryPath = path.join(rootDirectoryPath, skillName);
  const isInstalled = isSkillDirectory(skillDirectoryPath);

  if (!(isInstalled || isTracked)) {
    throw new Error(
      `Skill "${skillName}" is not installed in ${rootDirectoryPath}.`
    );
  }

  if (!(isTracked || options.force)) {
    throw new Error(
      `Skill "${skillName}" exists in ${rootDirectoryPath} but is not tracked by ${LOCKFILE_NAME}. Pass --force to remove it.`
    );
  }

  if (isInstalled) {
    fs.rmSync(skillDirectoryPath, {
      force: true,
      recursive: true,
    });
  }

  if (isTracked) {
    delete lockfile.skills[skillName];
    writeSkillsLockfile(rootDirectoryPath, lockfile);
  }

  const result = {
    name: skillName,
    path: skillDirectoryPath,
    removedFromDisk: isInstalled,
    removedFromLockfile: isTracked,
  } satisfies SkillsRemoveResult;

  if (options.toon) {
    writeToon(runtime, result);
    return 0;
  }

  runtime.stdout.write(
    `Removed skill "${skillName}" from ${rootDirectoryPath}.\n`
  );
  return 0;
};
