export const timeout = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const tryParse = <T>(
  value: string | null | undefined,
  defaultValue: T
) => {
  if (!value) return defaultValue;
  try {
    return JSON.parse(value) as T;
  } catch {
    return defaultValue;
  }
};

export const getStackTrace = () => {
  const err = new Error();
  return err.stack;
};

export const clone = <T>(value: T) => JSON.parse(JSON.stringify(value)) as T;

/**
 * Memoizes a function.
 * @param fn The function to memoize.
 * @returns The memoized function.
 */
export const memoize = <T extends (...args: any[]) => any>(fn: T): T => {
  const cache = new Map();
  return ((...args: any[]) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
};
