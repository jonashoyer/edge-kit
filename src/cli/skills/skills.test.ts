import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

    writeSkillDirectory(codexRoot, 'untracked-skill');
    writeSkillsLockfile(codexRoot, {
      skills: {
        'missing-skill': {
          computedHash: 'missing-hash',
          source: 'example/missing',
          sourceType: 'github',
        },
        'tracked-skill': {
          computedHash: computeSkillDirectoryHash(trackedSkillPath),
          source: 'example/tracked',
          sourceType: 'github',
        },
      },
      version: 1,
    });

    await runSkillsListCommand(
      {
        json: true,
      },
      runtime
    );

    const result = JSON.parse(getOutput(stdout)) as {
      skills: Array<{ name: string; status: string }>;
    };

    expect(result.skills).toEqual([
      expect.objectContaining({
        name: 'missing-skill',
        status: 'missing',
      }),
      expect.objectContaining({
        name: 'tracked-skill',
        status: 'tracked',
      }),
      expect.objectContaining({
        name: 'untracked-skill',
        status: 'untracked',
      }),
    ]);
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

    writeFile(path.join(driftSkillPath, 'SKILL.md'), '# drift-skill changed\n');
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
        json: true,
      },
      runtime
    );

    const result = JSON.parse(getOutput(stdout)) as {
      skills: Array<{ name: string; status: string }>;
    };

    expect(result.skills).toEqual([
      expect.objectContaining({
        name: 'drift-skill',
        status: 'drifted',
      }),
      expect.objectContaining({
        name: 'missing-skill',
        status: 'missing',
      }),
    ]);
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
        json: true,
      },
      runtime
    );

    const result = JSON.parse(getOutput(stdout)) as {
      actualHash: string;
      expectedHash: string;
      name: string;
      sourceSubpath: string;
      status: string;
    };

    expect(result).toEqual(
      expect.objectContaining({
        actualHash: expectedHash,
        expectedHash,
        name: 'info-skill',
        sourceSubpath: '.agents/skills/info-skill',
        status: 'tracked',
      })
    );
  });
});
