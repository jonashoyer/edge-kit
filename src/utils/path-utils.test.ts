import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  getNormalizedRelativePath,
  matchesPathPattern,
  normalizePathPattern,
  normalizeRelativePath,
} from './path-utils';

describe('normalizeRelativePath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizeRelativePath('foo\\bar\\baz.txt')).toBe('foo/bar/baz.txt');
  });

  it('removes leading current-directory prefixes', () => {
    expect(normalizeRelativePath('./foo/bar.txt')).toBe('foo/bar.txt');
    expect(normalizeRelativePath('.\\foo\\bar.txt')).toBe('foo/bar.txt');
  });

  it('removes leading slashes', () => {
    expect(normalizeRelativePath('/foo/bar.txt')).toBe('foo/bar.txt');
  });

  it('leaves normalized relative paths unchanged', () => {
    expect(normalizeRelativePath('foo/bar.txt')).toBe('foo/bar.txt');
  });
});

describe('normalizePathPattern', () => {
  it('trims whitespace and normalizes slashes', () => {
    expect(normalizePathPattern('  .\\src\\**\\*.ts  ')).toBe('src/**/*.ts');
  });

  it('removes trailing slashes', () => {
    expect(normalizePathPattern('src/utils///')).toBe('src/utils');
  });

  it('handles empty or slash-only inputs safely', () => {
    expect(normalizePathPattern('')).toBe('');
    expect(normalizePathPattern('   /  ')).toBe('');
  });
});

describe('getNormalizedRelativePath', () => {
  it('builds nested relative paths', () => {
    const fromPath = path.join('/repo', 'src');
    const toPath = path.join('/repo', 'src', 'utils', 'path-utils.ts');

    expect(getNormalizedRelativePath(fromPath, toPath)).toBe(
      'utils/path-utils.ts'
    );
  });

  it('normalizes separators in the returned relative path', () => {
    const relativeSpy = vi
      .spyOn(path, 'relative')
      .mockReturnValue('src\\utils.ts');

    try {
      expect(getNormalizedRelativePath('/repo', '/repo/src/utils.ts')).toBe(
        'src/utils.ts'
      );
    } finally {
      relativeSpy.mockRestore();
    }
  });

  it('returns an empty string for the same path', () => {
    expect(getNormalizedRelativePath('/repo/src', '/repo/src')).toBe('');
  });
});

describe('matchesPathPattern', () => {
  it('matches exact file paths', () => {
    expect(
      matchesPathPattern('src/utils/path-utils.ts', 'src/utils/path-utils.ts')
    ).toBe(true);
  });

  it('matches directory prefixes', () => {
    expect(matchesPathPattern('src/foo.ts', 'src')).toBe(true);
  });

  it('matches glob patterns', () => {
    expect(matchesPathPattern('src/utils/path-utils.ts', 'src/**/*.ts')).toBe(
      true
    );
  });

  it('returns false for non-matching patterns', () => {
    expect(matchesPathPattern('src/utils/path-utils.ts', 'tests/**/*.ts')).toBe(
      false
    );
  });

  it('returns false for empty patterns', () => {
    expect(matchesPathPattern('src/utils/path-utils.ts', '')).toBe(false);
  });
});
