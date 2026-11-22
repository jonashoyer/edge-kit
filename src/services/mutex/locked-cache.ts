import type { AbstractKeyValueService } from '../key-value/abstract-key-value';
import type { AbstractMutex, MutexOptions } from './abstract-mutex';
import { KvMutex } from './mutex-kv';

export type LockedCacheOptions<T> = {
  /** Skip cache reads and always compute and store a fresh value. */
  bypassCache?: boolean;
  /** Predicate to validate whether a cached entry is still fresh (e.g. token expiry buffer). */
  isFresh?: (value: T) => boolean;
  /** Override the mutex lock name. Defaults to the cache `key`. */
  lockName?: string;
  /** Per-call mutex options (TTL, retries, backoff, prefix, logger). */
  lockOptions?: MutexOptions;
  /** Mutex instance to coordinate refreshes. Defaults to a new `KvMutex(kv)`. */
  mutex?: AbstractMutex;
  /** Static TTL in seconds or a function deriving TTL from the computed value. */
  ttlSeconds?: number | ((value: T) => number | undefined);
};

const isUsableCachedValue = <T>(
  value: T | null,
  isFresh?: (candidate: T) => boolean
): value is T => value !== null && (isFresh ? isFresh(value) : true);

/**
 * Distributed cache-stampede protection using double-checked locking over a
 * Key-Value store and a mutex.
 *
 * 1. Fast path (no lock): returns a fresh cached value from `kv` if present.
 * 2. Lock path: acquires `mutex` for the key, re-reads `kv` in case another
 *    caller populated it while waiting, and only invokes `compute` on a miss
 *    or stale entry.
 *
 * @example
 * ```ts
 * const token = await getOrSetWithLock(
 *   kv,
 *   'github:token:contents:read',
 *   async () => await mintToken(),
 *   {
 *     isFresh: (entry) => entry.expiresAt - 5 * 60_000 > Date.now(),
 *     ttlSeconds: (entry) => Math.max(1, Math.floor((entry.expiresAt - Date.now()) / 1000)),
 *   }
 * );
 * ```
 */
export const getOrSetWithLock = async <T>(
  kv: AbstractKeyValueService,
  key: string,
  compute: () => Promise<T>,
  options?: LockedCacheOptions<T>
): Promise<T> => {
  const bypassCache = options?.bypassCache ?? false;
  const isFresh = options?.isFresh;

  if (!bypassCache) {
    const cached = await kv.get<T>(key);
    if (isUsableCachedValue(cached, isFresh)) {
      return cached;
    }
  }

  const mutex = options?.mutex ?? new KvMutex(kv);
  const lockName = options?.lockName ?? key;

  return await mutex.withLock(
    lockName,
    async () => {
      if (!bypassCache) {
        const rechecked = await kv.get<T>(key);
        if (isUsableCachedValue(rechecked, isFresh)) {
          return rechecked;
        }
      }

      const value = await compute();
      if (value !== undefined) {
        const resolvedTtl =
          typeof options?.ttlSeconds === 'function'
            ? options.ttlSeconds(value)
            : options?.ttlSeconds;
        await kv.set(key, value, resolvedTtl);
      }

      return value;
    },
    options?.lockOptions
  );
};
