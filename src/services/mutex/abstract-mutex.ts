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
}
