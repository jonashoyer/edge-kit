import React, { type ReactNode } from "react";
import { CacheStateContext } from "./use-cached-promise";

/**
 * Represents a cached value with optional expiration
 */
export type CacheEntry<T> = {
  value: T;
  expiresAt: number | null; // Unix timestamp in ms, null = never expires
};

/**
 * Result wrapper that includes expiration time
 */
export type CacheableResult<T> = {
  data: T;
  /**
   * Expiration timestamp (can be in seconds or milliseconds - will be auto-detected)
   * If provided, this takes precedence over TTL
   */
  expiresAt?: number;
};

/**
 * Options for caching a promise
 */
export type CacheOptions = {
  /**
   * Time-to-live in milliseconds. If not provided, cache never expires.
   * Ignored if the promise returns an expiresAt value.
   */
  ttl?: number;
  /**
   * If true, always fetch fresh data and update cache
   */
  forceFresh?: boolean;
  /**
   * If true, return stale data while revalidating in background
   */
  staleWhileRevalidate?: boolean;
};

/**
 * Cache state management
 */
export type CacheState = {
  cache: Map<string, CacheEntry<unknown>>;
  pendingRequests: Map<string, Promise<unknown>>;
};

/**
 * Context value for cache operations
 */
export type CacheContextValue = {
  get: <T>(key: string) => T | undefined;
  set: <T>(key: string, value: T, ttl?: number) => void;
  delete: (key: string) => void;
  clear: () => void;
  has: (key: string) => boolean;
  /**
   * Execute a promise with caching. Key and options are provided at call time.
   */
  cachedPromise: <T>(
    key: string,
    promiseFn: () => Promise<T> | Promise<CacheableResult<T>>,
    options?: CacheOptions
  ) => Promise<T>;
};

const PromiseCacheContext = React.createContext<CacheContextValue | null>(null);

type PromiseCacheProviderProps = {
  children: ReactNode;
};

/**
 * Provider component that manages the promise cache state
 */
export function PromiseCacheProvider({ children }: PromiseCacheProviderProps) {
  // Use ref to avoid re-renders when cache updates
  const stateRef = React.useRef<CacheState>({
    cache: new Map(),
    pendingRequests: new Map(),
  });

  const get = React.useCallback(<T,>(key: string): T | undefined => {
    const entry = stateRef.current.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      return;
    }

    // Check if expired
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      stateRef.current.cache.delete(key);
      return;
    }

    return entry.value;
  }, []);

  const set = React.useCallback(<T,>(key: string, value: T, ttl?: number) => {
    const expiresAt = ttl ? Date.now() + ttl : null;
    stateRef.current.cache.set(key, { value, expiresAt });
  }, []);

  const deleteEntry = React.useCallback((key: string) => {
    stateRef.current.cache.delete(key);
    stateRef.current.pendingRequests.delete(key);
  }, []);

  const clear = React.useCallback(() => {
    stateRef.current.cache.clear();
    stateRef.current.pendingRequests.clear();
  }, []);

  const has = React.useCallback((key: string): boolean => {
    const entry = stateRef.current.cache.get(key);
    if (!entry) {
      return false;
    }

    // Check if expired
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      stateRef.current.cache.delete(key);
      return false;
    }

    return true;
  }, []);

  // Helper: Extract value and expiration from raw result
  const processResult = React.useCallback(
    <T,>(rawResult: unknown, ttl?: number) => {
      let actualValue: T;
      let expiresAt: number | null = null;

      if (rawResult && typeof rawResult === "object" && "data" in rawResult) {
        // Result is CacheableResult<T>
        const cacheableResult = rawResult as { data: T; expiresAt?: number };
        actualValue = cacheableResult.data;

        if (cacheableResult.expiresAt) {
          // Convert to milliseconds if in seconds (< 10^10 = seconds)
          const timestamp = cacheableResult.expiresAt;
          expiresAt = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
        }
      } else {
        // Result is plain T, use TTL if provided
        actualValue = rawResult as T;
        expiresAt = ttl ? Date.now() + ttl : null;
      }

      return { actualValue, expiresAt };
    },
    []
  );

  const cachedPromise = React.useCallback(
    async <T,>(
      key: string,
      promiseFn: () => Promise<T> | Promise<{ data: T; expiresAt?: number }>,
      options: CacheOptions = {}
    ): Promise<T> => {
      const { ttl, forceFresh } = options;

      // Check cache
      if (!forceFresh) {
        const cachedEntry = stateRef.current.cache.get(key);
        if (cachedEntry) {
          const isExpired =
            cachedEntry.expiresAt !== null &&
            Date.now() > cachedEntry.expiresAt;
          if (!isExpired) {
            return cachedEntry.value as T;
          }
        }
      }

      // Check pending requests (deduplication)
      const pendingRequest = stateRef.current.pendingRequests.get(key);
      if (pendingRequest) {
        return (await pendingRequest) as T;
      }

      // Execute and cache
      const promise = promiseFn();
      stateRef.current.pendingRequests.set(key, promise);

      try {
        const rawResult = await promise;
        const { actualValue, expiresAt } = processResult<T>(rawResult, ttl);

        stateRef.current.cache.set(key, { value: actualValue, expiresAt });
        return actualValue;
      } finally {
        stateRef.current.pendingRequests.delete(key);
      }
    },
    [processResult]
  );

  const value: CacheContextValue = {
    get,
    set,
    delete: deleteEntry,
    clear,
    has,
    cachedPromise,
  };

  return (
    <PromiseCacheContext.Provider value={value}>
      <CacheStateContext.Provider value={stateRef.current}>
        {children}
      </CacheStateContext.Provider>
    </PromiseCacheContext.Provider>
  );
}

/**
 * Hook to access cache context operations
 */
export function useCacheContext(): CacheContextValue {
  const context = React.useContext(PromiseCacheContext);

  if (!context) {
    throw new Error(
      "useCacheContext must be used within a PromiseCacheProvider"
    );
  }

  return context;
}

/**
 * Internal hook to access the full cache state (for advanced usage)
 */
export function useCacheState(): CacheState {
  const context = React.useContext(PromiseCacheContext);

  if (!context) {
    throw new Error("useCacheState must be used within a PromiseCacheProvider");
  }

  // Access the ref through a private symbol or context extension
  // For now, we'll expose via a separate internal context if needed
  throw new Error("Not yet implemented - use useCacheContext instead");
}
