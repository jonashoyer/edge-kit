import { CustomError } from "../../utils/custom-error";
import { genId } from "../../utils/id-generator";
import { timeout } from "../../utils/misc-utils";
import type { AbstractKeyValueService } from "../key-value/abstract-key-value";
import type { AbstractLogger } from "../logging/abstract-logger";

export type BackoffStrategy = "exponential" | "none";

/**
 * Error thrown when mutex acquisition times out after all retries
 */
export class MutexAcquireTimeoutError extends CustomError<"MUTEX_ACQUIRE_TIMEOUT"> {
  constructor(name: string, retries: number) {
    super(
      `Failed to acquire mutex '${name}' after ${retries} retries`,
      "MUTEX_ACQUIRE_TIMEOUT"
    );
  }
}

const DEFAULT_PREFIX = "mtx:";
const DEFAULT_TTL_SECONDS = 30;
const DEFAULT_RETRIES = 5;
const DEFAULT_RETRY_DELAY_MS = 50;
const DEFAULT_JITTER_MS = 20;

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

function buildOwnerKey(prefix: string, name: string): string {
  return `${prefix}${name}:owner`;
}

function buildCountKey(prefix: string, name: string): string {
  return `${prefix}${name}:count`;
}

export class KvMutex<TNamespace extends string = string> {
  private readonly kv: AbstractKeyValueService;
  private readonly prefix: string;
  private readonly ttlSeconds: number;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private readonly backoff: BackoffStrategy;
  private readonly jitterMs: number;
  private readonly logger?: AbstractLogger;

  constructor(kv: AbstractKeyValueService, options?: MutexOptions) {
    this.kv = kv;
    this.prefix = options?.prefix ?? DEFAULT_PREFIX;
    this.ttlSeconds = options?.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    this.retries = options?.retries ?? DEFAULT_RETRIES;
    this.retryDelayMs = options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.backoff = options?.backoff ?? "exponential";
    this.jitterMs = options?.jitterMs ?? DEFAULT_JITTER_MS;
    this.logger = options?.logger;
  }

  async acquire(name: TNamespace): Promise<AcquireResult> {
    const ownerKey = buildOwnerKey(this.prefix, name);
    const countKey = buildCountKey(this.prefix, name);
    const token = genId();

    let delayMs = this.retryDelayMs;

    for (let attemptIndex = 0; attemptIndex <= this.retries; attemptIndex++) {
      const count = await this.kv.increment(countKey, 1);

      if (count === 1) {
        await this.kv.set(ownerKey, token, this.ttlSeconds);
        await this.kv.expire(countKey, this.ttlSeconds);
        this.logger?.info("mutex acquired", { name, attemptIndex });
        return { token };
      }

      if (attemptIndex < this.retries) {
        const jitter = Math.floor(Math.random() * this.jitterMs);
        await timeout(delayMs + jitter);
        delayMs = this.backoff === "exponential" ? delayMs * 2 : delayMs;
        continue;
      }

      break;
    }

    this.logger?.warn("mutex acquire timeout", { name, retries: this.retries });
    throw new MutexAcquireTimeoutError(name, this.retries);
  }

  async release(name: TNamespace, token: string): Promise<boolean> {
    const ownerKey = buildOwnerKey(this.prefix, name);
    const countKey = buildCountKey(this.prefix, name);
    const currentToken = await this.kv.get<string>(ownerKey);

    if (currentToken !== token) {
      this.logger?.warn("mutex release token mismatch", { name });
      return false;
    }

    await this.kv.mdelete([ownerKey, countKey]);
    this.logger?.info("mutex released", { name });
    return true;
  }

  async refresh(name: TNamespace, token: string): Promise<boolean> {
    const ownerKey = buildOwnerKey(this.prefix, name);
    const countKey = buildCountKey(this.prefix, name);
    const currentToken = await this.kv.get<string>(ownerKey);

    if (currentToken !== token) {
      this.logger?.warn("mutex refresh token mismatch", { name });
      return false;
    }

    const ownerOk = await this.kv.expire(ownerKey, this.ttlSeconds);
    const countOk = await this.kv.expire(countKey, this.ttlSeconds);
    const ok = ownerOk && countOk;
    if (ok) {
      this.logger?.info("mutex refreshed", { name });
    } else {
      this.logger?.warn("mutex refresh failed", { name });
    }
    return ok;
  }

  async withLock<T>(
    name: TNamespace,
    runExclusive: (refresher: () => Promise<boolean>) => Promise<T>
  ): Promise<T> {
    const { token } = await this.acquire(name);
    try {
      return await runExclusive(() => this.refresh(name, token));
    } finally {
      await this.release(name, token);
    }
  }
}
