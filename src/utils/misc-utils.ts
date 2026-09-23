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
  const err = new Error('Stack trace');
  return err.stack;
};

export const clone = <T>(value: T) => JSON.parse(JSON.stringify(value)) as T;

/**
 * Memoizes a function.
 * @param fn The function to memoize.
 * @returns The memoized function.
 */
export const memoize = <Args extends unknown[], Result>(
  fn: (...args: Args) => Result
): ((...args: Args) => Result) => {
  const cache = new Map<string, { value: Result }>();
  return (...args: Args) => {
    const key = JSON.stringify(args);
    const cached = cache.get(key);
    if (cached) return cached.value;
    const result = fn(...args);
    cache.set(key, { value: result });
    return result;
  };
};
