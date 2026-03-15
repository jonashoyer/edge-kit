import path from 'node:path';

const LEADING_CURRENT_DIRECTORY_PATTERN = /^\.\//;
const LEADING_SLASHES_PATTERN = /^\/+/;
const TRAILING_SLASHES_PATTERN = /\/+$/;
const WINDOWS_PATH_SEPARATOR_PATTERN = /\\/g;

/**
 * Normalizes a relative filesystem path for copy-paste-friendly reuse across
 * local filesystems and object-storage-style key paths.
 *
 * Converts Windows separators to forward slashes and strips leading `./` or
 * `/` so callers can compare paths using a consistent relative format.
 */
export const normalizeRelativePath = (value: string): string => {
  return value
    .replace(WINDOWS_PATH_SEPARATOR_PATTERN, '/')
    .replace(LEADING_CURRENT_DIRECTORY_PATTERN, '')
    .replace(LEADING_SLASHES_PATTERN, '');
};

/**
 * Normalizes a user-provided path pattern before matching.
 *
 * Applies relative path normalization, trims surrounding whitespace, and
 * removes trailing slashes so directory prefixes and glob patterns compare
 * consistently.
 */
export const normalizePathPattern = (pattern: string): string => {
  return normalizeRelativePath(pattern.trim()).replace(
    TRAILING_SLASHES_PATTERN,
    ''
  );
};

/**
 * Builds a relative path between two filesystem locations and normalizes it to
 * the repo-friendly forward-slash form used by Edge Kit bundles and storage
 * listings.
 */
export const getNormalizedRelativePath = (
  fromPath: string,
  toPath: string
): string => {
  return normalizeRelativePath(path.relative(fromPath, toPath));
};

/**
 * Checks whether a relative path matches a normalized prefix or glob pattern.
 *
 * A match is true when the path equals the pattern, is nested beneath a
 * directory prefix, or satisfies Node's `path.matchesGlob(...)` semantics.
 */
export const matchesPathPattern = (
  relativePath: string,
  pattern: string
): boolean => {
  const normalizedRelativePath = normalizeRelativePath(relativePath);
  const normalizedPattern = normalizePathPattern(pattern);

  if (normalizedPattern.length === 0) {
    return false;
  }

  return (
    normalizedRelativePath === normalizedPattern ||
    normalizedRelativePath.startsWith(`${normalizedPattern}/`) ||
    path.matchesGlob(normalizedRelativePath, normalizedPattern)
  );
};
