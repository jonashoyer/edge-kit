import { CustomError } from '../../utils/custom-error';
import type { AbstractLogger } from '../logging/abstract-logger';

export type BackoffStrategy = 'exponential' | 'none';

/**
 * Error thrown when mutex acquisition times out after all retries
 */
export class MutexAcquireTimeoutError extends CustomError<'MUTEX_ACQUIRE_TIMEOUT'> {
  constructor(name: string, retries: number) {
    super(
      `Failed to acquire mutex '${name}' after ${retries} retries`,
      'MUTEX_ACQUIRE_TIMEOUT'
    );
  }
}

export type MutexOptions = {
  prefix?: string;
  ttlSeconds?: number;
  retries?: number;
  retryDelayMs?: number;
  backoff?: BackoffStrategy;
  jitterMs?: number;
  logger?: AbstractLogger;
};

export type AcquireResult = {
  token: string;
};

export abstract class AbstractMutex<TNamespace extends string = string> {
  abstract acquire(
    name: TNamespace,
    options?: MutexOptions
  ): Promise<AcquireResult>;

  abstract release(
    name: TNamespace,
    token: string,
    options?: MutexOptions
  ): Promise<boolean>;

  abstract refresh(
    name: TNamespace,
    token: string,
    options?: MutexOptions
  ): Promise<boolean>;

  async withLock<T>(
    name: TNamespace,
    runExclusive: (refresher: () => Promise<boolean>) => Promise<T>,
    options?: MutexOptions
  ): Promise<T> {
    const { token } = await this.acquire(name, options);
    try {
      return await runExclusive(() => this.refresh(name, token, options));
    } finally {
      await this.release(name, token, options);
    }
  }

  /**
   * Double-checked locking helper for cache-stampede / singleflight coordination.
   *
   * Checks for an existing fresh value before acquiring the lock, and checks
   * again once the lock is held so waiters reuse work completed by an earlier holder.
   */
  async withDoubleCheckedLock<T>(
    name: TNamespace,
    check: () => Promise<T | undefined> | T | undefined,
    runExclusive: (refresher: () => Promise<boolean>) => Promise<T>,
    options?: MutexOptions
  ): Promise<T> {
    const existing = await check();
    if (existing !== undefined) {
      return existing;
    }

    return await this.withLock(
      name,
      async (refresher) => {
        const rechecked = await check();
        if (rechecked !== undefined) {
          return rechecked;
        }

        return await runExclusive(refresher);
      },
      options
    );
  }
}
