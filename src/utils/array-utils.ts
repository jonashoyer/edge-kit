/**
 * Utility functions for working with arrays.
 * Includes helpers for chunking, deduplication, grouping, and ensuring array types.
 */
export const asArray = <T>(value: T | T[]): T[] => {
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
};

export const chunkArray = <T>(arr: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    const chunk = arr.slice(i, i + chunkSize);
    chunks.push(chunk);
  }
  return chunks;
};

export const last = <T>(arr: T[]) => arr.at(-1);

export const dedupe = <T>(arr: T[]) => Array.from(new Set(arr));

export const dedupeBy = <T>(arr: T[], key: (item: T) => string) => {
  const seen = new Set<string>();
  return arr.filter((item) => {
    const k = key(item);
    if (seen.has(k)) {
      return false;
    }
    seen.add(k);
    return true;
  });
};

type MapByBaseOptions<T, V> = {
  include?: (item: T) => boolean;
  resolveDuplicate?: (existing: V, next: V, key: string) => V;
};

export function mapBy<T>(
  arr: T[],
  options: MapByBaseOptions<T, T> & {
    key: (item: T) => string;
    transform?: never;
  }
): Map<string, T>;
export function mapBy<T, V>(
  arr: T[],
  options: MapByBaseOptions<T, V> & {
    transform: (item: T) => V;
    key: (item: V) => string;
  }
): Map<string, V>;
export function mapBy<T>(
  arr: T[],
  options: {
    include?: (item: T) => boolean;
    key: (item: unknown) => string;
    transform?: (item: T) => unknown;
    resolveDuplicate?: (
      existing: unknown,
      next: unknown,
      key: string
    ) => unknown;
  }
): Map<string, unknown> {
  const mapped = new Map<string, unknown>();

  for (const item of arr) {
    if (options.include && !options.include(item)) {
      continue;
    }

    const transformed = options.transform ? options.transform(item) : item;
    const groupKey = options.key(transformed);

    if (mapped.has(groupKey) && options.resolveDuplicate) {
      mapped.set(
        groupKey,
        options.resolveDuplicate(mapped.get(groupKey), transformed, groupKey)
      );
    } else {
      mapped.set(groupKey, transformed);
    }
  }

  return mapped;
}

type GroupMapByBaseOptions<T> = {
  include?: (item: T) => boolean;
};

export function groupMapBy<T>(
  arr: T[],
  options: GroupMapByBaseOptions<T> & {
    key: (item: T) => string;
    transform?: never;
  }
): Map<string, T[]>;
export function groupMapBy<T, V>(
  arr: T[],
  options: GroupMapByBaseOptions<T> & {
    transform: (item: T) => V;
    key: (item: V) => string;
  }
): Map<string, V[]>;
export function groupMapBy<T>(
  arr: T[],
  options: GroupMapByBaseOptions<T> & {
    key: (item: unknown) => string;
    transform?: (item: T) => unknown;
  }
): Map<string, unknown[]> {
  const groups = new Map<string, unknown[]>();

  for (const item of arr) {
    if (options.include && !options.include(item)) {
      continue;
    }

    const transformed = options.transform ? options.transform(item) : item;
    const groupKey = options.key(transformed);
    const group = groups.get(groupKey);

    if (group) {
      group.push(transformed);
    } else {
      groups.set(groupKey, [transformed]);
    }
  }

  return groups;
}
