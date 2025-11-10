// We need to re-export the context to access pendingRequests
import React from "react";
import type { CacheOptions } from "./promise-cache-context";

type CacheStateInternal = {
  cache: Map<string, { value: unknown; expiresAt: number | null }>;
  pendingRequests: Map<string, Promise<unknown>>;
};

// Internal context for accessing the full state including pendingRequests
const CacheStateContext = React.createContext<CacheStateInternal | null>(null);

export { CacheStateContext };

/**
 * Hook that wraps an async function with caching behavior
 *
 * @param key - Unique cache key
 * @param promiseFn - Async function to execute and cache
 * @param options - Caching options (ttl, forceFresh, staleWhileRevalidate)
 * @returns Object with execute function, cached data, loading state, and error
 *
 * @example
 * ```tsx
 * const { data, loading, error, execute } = useCachedPromise(
 *   'user-profile',
 *   () => fetchUserProfile(userId),
 *   { ttl: 5 * 60 * 1000 } // 5 minutes
 * );
 * ```
 */
export function useCachedPromise<T>(
  key: string,
  promiseFn: () => Promise<T> | Promise<{ data: T; expiresAt?: number }>,
  options: CacheOptions = {}
) {
  const cacheState = React.useContext(CacheStateContext);

  if (!cacheState) {
    throw new Error(
      "useCachedPromise must be used within a PromiseCacheProvider"
    );
  }

  const [data, setData] = React.useState<T | undefined>(() => {
    // Try to get from cache on mount
    const entry = cacheState.cache.get(key);
    if (entry && (entry.expiresAt === null || Date.now() <= entry.expiresAt)) {
      return entry.value as T;
    }
    return;
  });

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | undefined>();
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Helper: Check and return cached value if valid
  const getCachedValue = React.useCallback((): T | null => {
    const cachedEntry = cacheState.cache.get(key);
    if (!cachedEntry) return null;

    const isExpired =
      cachedEntry.expiresAt !== null && Date.now() > cachedEntry.expiresAt;

    return isExpired ? null : (cachedEntry.value as T);
  }, [cacheState, key]);

  // Helper: Handle stale-while-revalidate
  const handleStaleValue = React.useCallback((): boolean => {
    if (!options.staleWhileRevalidate) return false;

    const cachedEntry = cacheState.cache.get(key);
    if (!cachedEntry) return false;

    const isExpired =
      cachedEntry.expiresAt !== null && Date.now() > cachedEntry.expiresAt;

    if (!isExpired) return false;
    if (!mountedRef.current) return false;

    setData(cachedEntry.value as T);
    return true;
  }, [cacheState, key, options.staleWhileRevalidate]);

  // Helper: Process raw result into value and expiration
  const processRawResult = React.useCallback(
    (rawResult: unknown) => {
      let actualValue: T;
      let expiresAt: number | null = null;

      if (rawResult && typeof rawResult === "object" && "data" in rawResult) {
        // Result is CacheableResult<T>
        const cacheableResult = rawResult as {
          data: T;
          expiresAt?: number;
        };
        actualValue = cacheableResult.data;

        if (cacheableResult.expiresAt) {
          const timestamp = cacheableResult.expiresAt;
          expiresAt = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
        }
      } else {
        actualValue = rawResult as T;
        expiresAt = options.ttl ? Date.now() + options.ttl : null;
      }

      return { actualValue, expiresAt };
    },
    [options.ttl]
  );

  // Helper: Execute the actual promise and cache result
  const executePromise = React.useCallback(async (): Promise<T> => {
    const promise = promiseFn();
    cacheState.pendingRequests.set(key, promise);

    try {
      const rawResult = await promise;
      const { actualValue, expiresAt } = processRawResult(rawResult);

      cacheState.cache.set(key, { value: actualValue, expiresAt });

      if (mountedRef.current) {
        setData(actualValue);
        setLoading(false);
      }

      return actualValue;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));

      if (mountedRef.current) {
        setError(errorObj);
        setLoading(false);
      }

      throw errorObj;
    } finally {
      cacheState.pendingRequests.delete(key);
    }
  }, [promiseFn, cacheState, key, processRawResult]);

  // Helper: Update state with cached value
  const updateWithCachedValue = React.useCallback((value: T) => {
    if (mountedRef.current) {
      setData(value);
      setError(undefined);
    }
  }, []);

  // Helper: Handle pending request deduplication
  const handlePendingRequest =
    React.useCallback(async (): Promise<T | null> => {
      const pendingRequest = cacheState.pendingRequests.get(key);
      if (!pendingRequest) return null;

      const result = (await pendingRequest) as T;
      if (mountedRef.current) {
        setData(result);
        setLoading(false);
        setError(undefined);
      }
      return result;
    }, [cacheState, key]);

  const execute = React.useCallback(async (): Promise<T> => {
    // Check cache first (unless forceFresh)
    if (!options.forceFresh) {
      const cachedValue = getCachedValue();
      if (cachedValue !== null) {
        updateWithCachedValue(cachedValue);
        return cachedValue;
      }

      // Handle stale-while-revalidate
      handleStaleValue();
    }

    // Check for pending request (deduplication)
    const pendingResult = await handlePendingRequest();
    if (pendingResult !== null) {
      return pendingResult;
    }

    // Execute the promise
    if (mountedRef.current) {
      setLoading(true);
      setError(undefined);
    }

    return executePromise();
  }, [
    options.forceFresh,
    getCachedValue,
    updateWithCachedValue,
    handleStaleValue,
    handlePendingRequest,
    executePromise,
  ]);

  return {
    data,
    loading,
    error,
    execute,
  };
}
