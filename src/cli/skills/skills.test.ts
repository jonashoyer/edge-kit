import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encode } from '@toon-format/toon';
import { describe, expect, it, vi } from 'vitest';
import {
  computeSkillDirectoryHash,
  readSkillsLockfile,
  runSkillsInfoCommand,
  runSkillsInstallCommand,
  runSkillsListCommand,
  runSkillsRemoveCommand,
  runSkillsVerifyCommand,
  type SkillsCommandRuntime,
  writeSkillsLockfile,
} from './skills';

const createTempDir = (prefix: string): string => {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
};

const writeFile = (filePath: string, content: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

const writeSkillDirectory = (
  parentDirectoryPath: string,
  skillName: string,
  files: Record<string, string> = {
    'SKILL.md': `# ${skillName}\n`,
    'assets/icon.svg': '<svg></svg>\n',
  }
): string => {
  const skillDirectoryPath = path.join(parentDirectoryPath, skillName);

  for (const [relativeFilePath, content] of Object.entries(files)) {
    writeFile(path.join(skillDirectoryPath, relativeFilePath), content);
  }

  return skillDirectoryPath;
};

const createRuntime = (): {
  codexRoot: string;
  execFile: ReturnType<typeof vi.fn>;
  homeDir: string;
  runtime: SkillsCommandRuntime;
  stdout: { write: ReturnType<typeof vi.fn> };
} => {
  const homeDir = createTempDir('edge-kit-skills-home-');
  const stdout = {
    write: vi.fn(),
  };
  const execFile = vi.fn(async () => ({
    stderr: '',
    stdout: '',
  }));

  return {
    codexRoot: path.join(homeDir, '.codex', 'skills'),
    execFile,
    homeDir,
    runtime: {
      cwd: homeDir,
      execFile,
      homeDir,
      stdout: stdout as unknown as NodeJS.WriteStream,
    },
    stdout,
  };
};

const getOutput = (stdout: { write: ReturnType<typeof vi.fn> }): string => {
  return stdout.write.mock.calls.map((call) => String(call[0] ?? '')).join('');
};

describe('skills CLI runners', () => {
  it('installs a skill from a local directory and records lockfile metadata', async () => {
    const { codexRoot, runtime, stdout } = createRuntime();
    const sourceRoot = createTempDir('edge-kit-skills-source-');
    const sourceSkillPath = writeSkillDirectory(sourceRoot, 'find-skills');

    await runSkillsInstallCommand(
      {
        path: sourceSkillPath,
      },
      runtime
    );

    const installedSkillPath = path.join(codexRoot, 'find-skills');
    const lockfile = readSkillsLockfile(codexRoot);

    expect(fs.existsSync(path.join(installedSkillPath, 'SKILL.md'))).toBe(true);
    expect(lockfile.skills['find-skills']).toEqual(
      expect.objectContaining({
        computedHash: computeSkillDirectoryHash(installedSkillPath),
        source: sourceSkillPath,
        sourceType: 'local',
      })
    );
    expect(getOutput(stdout)).toContain('Installed skill "find-skills"');
  });

  it('installs a skill from a local repository layout', async () => {
    const { codexRoot, runtime } = createRuntime();
    const repositoryRoot = createTempDir('edge-kit-skills-repo-');

    writeSkillDirectory(
      path.join(repositoryRoot, '.agents', 'skills'),
      'repo-skill'
    );

    await runSkillsInstallCommand(
      {
        name: 'repo-skill',
        repo: repositoryRoot,
      },
      runtime
    );

    const lockfile = readSkillsLockfile(codexRoot);

    expect(lockfile.skills['repo-skill']).toEqual(
      expect.objectContaining({
        source: repositoryRoot,
        sourceSubpath: '.agents/skills/repo-skill',
        sourceType: 'local',
      })
    );
  });

  it('clones a GitHub repository reference before installing the requested skill', async () => {
    const { codexRoot, execFile, runtime } = createRuntime();

    execFile.mockImplementationOnce(async (_file: string, args: string[]) => {
      const cloneTargetPath = args[3];
      if (typeof cloneTargetPath !== 'string') {
        throw new Error('Expected git clone target path.');
      }

      writeSkillDirectory(
        path.join(cloneTargetPath, '.codex', 'skills'),
        'remote-skill'
      );

      return {
        stderr: '',
        stdout: '',
      };
    });

    await runSkillsInstallCommand(
      {
        name: 'remote-skill',
        repo: 'vercel-labs/skills',
      },
      runtime
    );

    expect(execFile).toHaveBeenCalledWith(
      'git',
      [
        'clone',
        '--depth=1',
        'https://github.com/vercel-labs/skills.git',
        expect.any(String),
      ],
      expect.objectContaining({
        cwd: runtime.cwd,
      })
    );
    expect(readSkillsLockfile(codexRoot).skills['remote-skill']).toEqual(
      expect.objectContaining({
        source: 'vercel-labs/skills',
        sourceSubpath: '.codex/skills/remote-skill',
        sourceType: 'github',
      })
    );
  });

  it('lists tracked, untracked, and missing skills', async () => {
    const { codexRoot, runtime, stdout } = createRuntime();
    const trackedSkillPath = writeSkillDirectory(codexRoot, 'tracked-skill');
    const untrackedSkillPath = writeSkillDirectory(
      codexRoot,
      'untracked-skill'
    );
    const trackedSkillHash = computeSkillDirectoryHash(trackedSkillPath);
    const missingSkillPath = path.join(codexRoot, 'missing-skill');

    writeSkillsLockfile(codexRoot, {
      skills: {
        'missing-skill': {
          computedHash: 'missing-hash',
          source: 'example/missing',
          sourceType: 'github',
        },
        'tracked-skill': {
          computedHash: trackedSkillHash,
          source: 'example/tracked',
          sourceType: 'github',
        },
      },
      version: 1,
    });

    await runSkillsListCommand(
      {
        toon: true,
      },
      runtime
    );

    expect(getOutput(stdout)).toBe(
      `${encode({
        root: codexRoot,
        skills: [
          {
            installed: false,
            name: 'missing-skill',
            path: missingSkillPath,
            source: 'example/missing',
            sourceType: 'github',
            status: 'missing',
            tracked: true,
          },
          {
            installed: true,
            name: 'tracked-skill',
            path: trackedSkillPath,
            source: 'example/tracked',
            sourceType: 'github',
            status: 'tracked',
            tracked: true,
          },
          {
            installed: true,
            name: 'untracked-skill',
            path: untrackedSkillPath,
            source: null,
            sourceType: null,
            status: 'untracked',
            tracked: false,
          },
        ],
      })}\n`
    );
  });

  it('refuses to remove untracked skills without force and removes tracked skills cleanly', async () => {
    const { codexRoot, runtime } = createRuntime();
    const sourceRoot = createTempDir('edge-kit-skills-remove-source-');
    const sourceSkillPath = writeSkillDirectory(sourceRoot, 'managed-skill');

    writeSkillDirectory(codexRoot, 'manual-skill');

    await expect(
      runSkillsRemoveCommand('manual-skill', {}, runtime)
    ).rejects.toThrow('is not tracked by skills-lock.json');

    await runSkillsInstallCommand(
      {
        path: sourceSkillPath,
      },
      runtime
    );
    await runSkillsRemoveCommand('managed-skill', {}, runtime);

    expect(fs.existsSync(path.join(codexRoot, 'managed-skill'))).toBe(false);
    expect(
      readSkillsLockfile(codexRoot).skills['managed-skill']
    ).toBeUndefined();
  });

  it('verifies tracked skills and reports drift plus missing installs', async () => {
    const { codexRoot, runtime, stdout } = createRuntime();
    const driftSkillPath = writeSkillDirectory(codexRoot, 'drift-skill');
    const originalHash = computeSkillDirectoryHash(driftSkillPath);
    const missingSkillPath = path.join(codexRoot, 'missing-skill');

    writeFile(path.join(driftSkillPath, 'SKILL.md'), '# drift-skill changed\n');
    const driftedHash = computeSkillDirectoryHash(driftSkillPath);
    writeSkillsLockfile(codexRoot, {
      skills: {
        'drift-skill': {
          computedHash: originalHash,
          source: 'example/drift',
          sourceType: 'github',
        },
        'missing-skill': {
          computedHash: 'missing-hash',
          source: 'example/missing',
          sourceType: 'github',
        },
      },
      version: 1,
    });

    await runSkillsVerifyCommand(
      {
        toon: true,
      },
      runtime
    );

    expect(getOutput(stdout)).toBe(
      `${encode({
        root: codexRoot,
        skills: [
          {
            actualHash: driftedHash,
            expectedHash: originalHash,
            name: 'drift-skill',
            path: driftSkillPath,
            source: 'example/drift',
            sourceSubpath: null,
            sourceType: 'github',
            status: 'drifted',
          },
          {
            expectedHash: 'missing-hash',
            name: 'missing-skill',
            path: missingSkillPath,
            source: 'example/missing',
            sourceSubpath: null,
            sourceType: 'github',
            status: 'missing',
          },
        ],
      })}\n`
    );
  });

  it('shows provenance and hash details for a tracked skill', async () => {
    const { codexRoot, runtime, stdout } = createRuntime();
    const skillPath = writeSkillDirectory(codexRoot, 'info-skill');
    const expectedHash = computeSkillDirectoryHash(skillPath);

    writeSkillsLockfile(codexRoot, {
      skills: {
        'info-skill': {
          computedHash: expectedHash,
          source: 'example/info',
          sourceSubpath: '.agents/skills/info-skill',
          sourceType: 'github',
        },
      },
      version: 1,
    });

    await runSkillsInfoCommand(
      'info-skill',
      {
        toon: true,
      },
      runtime
    );

    expect(getOutput(stdout)).toBe(
      `${encode({
        actualHash: expectedHash,
        expectedHash,
        installed: true,
        name: 'info-skill',
        path: skillPath,
        source: 'example/info',
        sourceSubpath: '.agents/skills/info-skill',
        sourceType: 'github',
        status: 'tracked',
        tracked: true,
      })}\n`
    );
  });
});
