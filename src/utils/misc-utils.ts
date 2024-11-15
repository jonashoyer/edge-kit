export const timeout = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const tryParse = <T>(value: string | null | undefined, defaultValue: T) => {
  if (!value) return defaultValue;
  try {
    return JSON.parse(value) as T;
  } catch (e) {
    return defaultValue;
  }
}

export const getStackTrace = () => {
  const err = new Error();
  return err.stack;
}

export const clone = <T>(value: T) => JSON.parse(JSON.stringify(value)) as T;

export interface FetchExtOptions {
  url: string;
  init?: RequestInit;
  timeout?: number;
}

export const fetchExt = async (opts: FetchExtOptions) => {
  const timeout = opts.timeout ?? 10000;

  const controller = new AbortController();
  const signal = controller.signal;

  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(opts.url, { signal, ...opts.init });
    clearTimeout(timeoutId);
    return res;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Fetch request timed out');
    }
    throw error;
  }
};

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
}
