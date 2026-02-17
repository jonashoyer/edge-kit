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
      prefix: options?.prefix ?? this.prefix,
      ttlSeconds: options?.ttlSeconds ?? this.ttlSeconds,
      retries: options?.retries ?? this.retries,
      retryDelayMs: options?.retryDelayMs ?? this.retryDelayMs,
      backoff: options?.backoff ?? this.backoff,
      jitterMs: options?.jitterMs ?? this.jitterMs,
      logger: options?.logger ?? this.logger,
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

    for (let attemptIndex = 0; attemptIndex <= opts.retries; attemptIndex++) {
      const count = await this.kv.increment(countKey, 1);

      if (count === 1) {
        await this.kv.set(ownerKey, token, opts.ttlSeconds);
        await this.kv.expire(countKey, opts.ttlSeconds);
        opts.logger?.info('mutex acquired', { name, attemptIndex });
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
}
