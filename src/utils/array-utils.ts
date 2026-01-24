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

export const groupBy = <T>(
  arr: T[],
  key: (item: T) => string
): Record<string, T[]> => {
  return arr.reduce(
    (acc, item) => {
      const groupKey = key(item);
      if (!acc[groupKey]) {
        acc[groupKey] = [];
      }
      acc[groupKey].push(item);
      return acc;
    },
    {} as Record<string, T[]>
  );
};
