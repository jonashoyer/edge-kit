import { genId } from '../../utils/id-generator';
import { timeout } from '../../utils/misc-utils';
import type { AbstractKeyValueService } from '../key-value/abstract-key-value';
import type { AbstractLogger } from '../logging/abstract-logger';
import {
  AbstractMutex,
  type AcquireResult,
  type BackoffStrategy,
  MutexAcquireTimeoutError,
  type MutexOptions,
} from './abstract-mutex';

const DEFAULT_PREFIX = 'mtx:';
const DEFAULT_TTL_SECONDS = 30;
const DEFAULT_RETRIES = 5;
const DEFAULT_RETRY_DELAY_MS = 50;
const DEFAULT_JITTER_MS = 20;

function buildOwnerKey(prefix: string, name: string): string {
  return `${prefix}${name}:owner`;
}

function buildCountKey(prefix: string, name: string): string {
  return `${prefix}${name}:count`;
}

export type KvMutexGetOrSetOptions<T, TNamespace extends string = string> = {
  /** Skip cache reads and always compute and store a fresh value. */
  bypassCache?: boolean;
  /** Predicate to validate whether a cached entry is still fresh (e.g. token expiry buffer). */
  isFresh?: (value: T) => boolean;
  /** Override the mutex lock name. Defaults to the cache `key`. */
  lockName?: TNamespace;
  /** Per-call mutex options (TTL, retries, backoff, prefix, logger). */
  lockOptions?: MutexOptions;
  /** Static TTL in seconds or a function deriving TTL from the computed value. */
  ttlSeconds?: number | ((value: T) => number | undefined);
};

const isUsableCachedValue = <T>(
  value: T | null,
  isFresh?: (candidate: T) => boolean
): value is T => value !== null && (isFresh ? isFresh(value) : true);

/**
 * Distributed Mutex implementation using a Key-Value store.
 * Provides locking mechanisms with TTL, retries, and exponential backoff.
 * Useful for coordinating access to shared resources in a distributed system.
 */
export class KvMutex<
  TNamespace extends string = string,
> extends AbstractMutex<TNamespace> {
  private readonly kv: AbstractKeyValueService;
  private readonly prefix: string;
  private readonly ttlSeconds: number;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private readonly backoff: BackoffStrategy;
  private readonly jitterMs: number;
  private readonly logger?: AbstractLogger;

  constructor(kv: AbstractKeyValueService, options?: MutexOptions) {
    super();
    this.kv = kv;
    this.prefix = options?.prefix ?? DEFAULT_PREFIX;
    this.ttlSeconds = options?.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    this.retries = options?.retries ?? DEFAULT_RETRIES;
    this.retryDelayMs = options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.backoff = options?.backoff ?? 'exponential';
    this.jitterMs = options?.jitterMs ?? DEFAULT_JITTER_MS;
    this.logger = options?.logger;
  }

  private getEffectiveOptions(options?: MutexOptions) {
    return {
      backoff: options?.backoff ?? this.backoff,
      jitterMs: options?.jitterMs ?? this.jitterMs,
      logger: options?.logger ?? this.logger,
      prefix: options?.prefix ?? this.prefix,
      retries: options?.retries ?? this.retries,
      retryDelayMs: options?.retryDelayMs ?? this.retryDelayMs,
      ttlSeconds: options?.ttlSeconds ?? this.ttlSeconds,
    };
  }

  override async acquire(
    name: TNamespace,
    options?: MutexOptions
  ): Promise<AcquireResult> {
    const opts = this.getEffectiveOptions(options);
    const ownerKey = buildOwnerKey(opts.prefix, name);
    const countKey = buildCountKey(opts.prefix, name);
    const token = genId();

    let delayMs = opts.retryDelayMs;

    for (
      let attemptIndex = 0;
      attemptIndex <= opts.retries;
      attemptIndex += 1
    ) {
      // biome-ignore lint/performance/noAwaitInLoops: Each lock attempt must observe the previous attempt and retry delay.
      const count = await this.kv.increment(countKey, 1);

      // Increment and expiry are separate requests: a crash between them can strand the lock.
      if (count === 1) {
        await this.kv.set(ownerKey, token, opts.ttlSeconds);
        await this.kv.expire(countKey, opts.ttlSeconds);
        opts.logger?.info('mutex acquired', { attemptIndex, name });
        return { token };
      }

      if (attemptIndex < opts.retries) {
        const jitter = Math.floor(Math.random() * opts.jitterMs);
        await timeout(delayMs + jitter);
        delayMs = opts.backoff === 'exponential' ? delayMs * 2 : delayMs;
        continue;
      }

      break;
    }

    opts.logger?.warn('mutex acquire timeout', { name, retries: opts.retries });
    throw new MutexAcquireTimeoutError(name, opts.retries);
  }

  override async release(
    name: TNamespace,
    token: string,
    options?: MutexOptions
  ): Promise<boolean> {
    const opts = this.getEffectiveOptions(options);
    const ownerKey = buildOwnerKey(opts.prefix, name);
    const countKey = buildCountKey(opts.prefix, name);
    const currentToken = await this.kv.get<string>(ownerKey);

    if (currentToken !== token) {
      opts.logger?.warn('mutex release token mismatch', { name });
      return false;
    }

    await this.kv.mdelete([ownerKey, countKey]);
    opts.logger?.info('mutex released', { name });
    return true;
  }

  override async refresh(
    name: TNamespace,
    token: string,
    options?: MutexOptions
  ): Promise<boolean> {
    const opts = this.getEffectiveOptions(options);
    const ownerKey = buildOwnerKey(opts.prefix, name);
    const countKey = buildCountKey(opts.prefix, name);
    const currentToken = await this.kv.get<string>(ownerKey);

    if (currentToken !== token) {
      opts.logger?.warn('mutex refresh token mismatch', { name });
      return false;
    }

    const ownerOk = await this.kv.expire(ownerKey, opts.ttlSeconds);
    const countOk = await this.kv.expire(countKey, opts.ttlSeconds);
    const ok = ownerOk && countOk;
    if (ok) {
      opts.logger?.info('mutex refreshed', { name });
    } else {
      opts.logger?.warn('mutex refresh failed', { name });
    }
    return ok;
  }

  /**
   * Read a value from the underlying KV store or compute and cache it under
   * this mutex using double-checked locking (cache-stampede protection).
   *
   * 1. Fast path (no lock): returns a fresh cached value from `kv` if present.
   * 2. Lock path: acquires the mutex, re-reads `kv` in case another caller
   *    populated it while waiting, and only invokes `compute` on a miss or
   *    stale entry.
   *
   * @example
   * ```ts
   * const token = await mutex.getOrSet(
   *   'github:token:contents:read',
   *   async () => await mintToken(),
   *   {
   *     isFresh: (entry) => entry.expiresAt - 5 * 60_000 > Date.now(),
   *     ttlSeconds: (entry) => Math.max(1, Math.floor((entry.expiresAt - Date.now()) / 1000)),
   *   }
   * );
   * ```
   */
  async getOrSet<T>(
    key: TNamespace,
    compute: (refresher: () => Promise<boolean>) => Promise<T>,
    options?: KvMutexGetOrSetOptions<T, TNamespace>
  ): Promise<T> {
    const bypassCache = options?.bypassCache ?? false;
    const isFresh = options?.isFresh;
    const lockName = options?.lockName ?? key;

    const computeAndStore = async (
      refresher: () => Promise<boolean>
    ): Promise<T> => {
      const value = await compute(refresher);
      if (value !== undefined) {
        const resolvedTtl =
          typeof options?.ttlSeconds === 'function'
            ? options.ttlSeconds(value)
            : options?.ttlSeconds;
        await this.kv.set(key, value, resolvedTtl);
      }
      return value;
    };

    if (bypassCache) {
      return await this.withLock(
        lockName,
        computeAndStore,
        options?.lockOptions
      );
    }

    return await this.withDoubleCheckedLock(
      lockName,
      async () => {
        const cached = await this.kv.get<T>(key);
        return isUsableCachedValue(cached, isFresh) ? cached : undefined;
      },
      computeAndStore,
      options?.lockOptions
    );
  }
}
