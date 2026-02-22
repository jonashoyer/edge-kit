import type { AbstractKeyValueService } from '../key-value/abstract-key-value';
import { KvMutex } from '../mutex/mutex-kv';
import type { AbstractStorage } from '../storage/abstract-storage';
import {
  AbstractLogger,
  type LogLevel,
  type LogMetadata,
  type StandardLogger,
} from './abstract-logger';
import {
  normalizeOutputMetadata,
  type SerializedLogMetadata,
  safeJsonStringify,
  toError,
} from './logger-utils';

const DEFAULT_MAX_ENTRIES = 10_000;
const DEFAULT_ENTRY_TTL_SECONDS = 86_400;
const DEFAULT_CLOSE_RESULT_TTL_SECONDS = 86_400;
const DEFAULT_CLOSE_LOCK_TTL_SECONDS = 120;
const DEFAULT_CHUNK_SIZE = 500;
const KV_NAMESPACE_PREFIX = 'lg:kv-file:';

interface KvFileLoggerMetadataEnvelope {
  type: 'metadata';
  startedAt: string;
  endedAt: string;
  droppedEntryCount: number;
  maxEntries: number;
  entryCount: number;
  metadata?: SerializedLogMetadata;
}

interface KvFileLoggerStoredMeta {
  startedAt: string;
  metadata?: SerializedLogMetadata;
}

interface KvFileLoggerState {
  seqKey: string;
  droppedKey: string;
  entryPrefix: string;
  closeResultKey: string;
  startedAtKey: string;
  metaKey: string;
  closeLockName: string;
}

const buildState = (key: string, mediatorKey?: string): KvFileLoggerState => {
  const suffix = mediatorKey ?? key;
  const ns = `${KV_NAMESPACE_PREFIX}${suffix}`;

  return {
    seqKey: `${ns}:seq`,
    droppedKey: `${ns}:dropped`,
    entryPrefix: `${ns}:entry:`,
    closeResultKey: `${ns}:close-result`,
    startedAtKey: `${ns}:started-at`,
    metaKey: `${ns}:meta`,
    closeLockName: `${ns}:close`,
  };
};

const chunk = <T>(items: T[], chunkSize: number): T[][] => {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    out.push(items.slice(index, index + chunkSize));
  }
  return out;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

export interface KvFileLoggerEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  metadata?: SerializedLogMetadata;
}

export interface KvFileLoggerOptions {
  key: string;
  storage: AbstractStorage;
  kv: AbstractKeyValueService;
  metadata?: Record<string, unknown>;
  passthrough?: StandardLogger;
  maxEntries?: number;
  mediatorKey?: string;
  entryTtlSeconds?: number;
  closeResultTtlSeconds?: number;
  closeLockTtlSeconds?: number;
}

export interface KvFileLoggerCloseResult {
  key: string;
  url: string;
  expiresAt: number;
  entryCount: number;
}

export class KvFileLogger extends AbstractLogger {
  private readonly key: string;
  private readonly kv: AbstractKeyValueService;
  private readonly storage: AbstractStorage;
  private readonly passthrough?: StandardLogger;
  private readonly maxEntries: number;
  private readonly entryTtlSeconds: number;
  private readonly closeResultTtlSeconds: number;
  private readonly closeLockTtlSeconds: number;
  private readonly startedAt: string;
  private readonly metadata?: SerializedLogMetadata;
  private readonly state: KvFileLoggerState;

  private closed = false;
  private closeResult: KvFileLoggerCloseResult | null = null;
  private closePromise: Promise<KvFileLoggerCloseResult> | null = null;
  private localSeq = 0;
  private writeQueue: Promise<void> = Promise.resolve();
  private firstWriteError: Error | null = null;

  constructor(options: KvFileLoggerOptions) {
    super();

    if (
      options.maxEntries !== undefined &&
      !Number.isInteger(options.maxEntries)
    ) {
      throw new Error('KvFileLogger maxEntries must be an integer');
    }
    if (options.maxEntries !== undefined && options.maxEntries <= 0) {
      throw new Error('KvFileLogger maxEntries must be greater than 0');
    }
    if (
      options.entryTtlSeconds !== undefined &&
      (!Number.isInteger(options.entryTtlSeconds) ||
        options.entryTtlSeconds <= 0)
    ) {
      throw new Error(
        'KvFileLogger entryTtlSeconds must be a positive integer'
      );
    }
    if (
      options.closeResultTtlSeconds !== undefined &&
      (!Number.isInteger(options.closeResultTtlSeconds) ||
        options.closeResultTtlSeconds <= 0)
    ) {
      throw new Error(
        'KvFileLogger closeResultTtlSeconds must be a positive integer'
      );
    }
    if (
      options.closeLockTtlSeconds !== undefined &&
      (!Number.isInteger(options.closeLockTtlSeconds) ||
        options.closeLockTtlSeconds <= 0)
    ) {
      throw new Error(
        'KvFileLogger closeLockTtlSeconds must be a positive integer'
      );
    }

    this.key = options.key;
    this.kv = options.kv;
    this.storage = options.storage;
    this.passthrough = options.passthrough;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.entryTtlSeconds = options.entryTtlSeconds ?? DEFAULT_ENTRY_TTL_SECONDS;
    this.closeResultTtlSeconds =
      options.closeResultTtlSeconds ?? DEFAULT_CLOSE_RESULT_TTL_SECONDS;
    this.closeLockTtlSeconds =
      options.closeLockTtlSeconds ?? DEFAULT_CLOSE_LOCK_TTL_SECONDS;
    this.startedAt = new Date().toISOString();
    this.metadata = AbstractLogger.serializeLogMetadata(options.metadata);
    this.state = buildState(options.key, options.mediatorKey);

    const storedMeta: KvFileLoggerStoredMeta = {
      startedAt: this.startedAt,
    };
    if (this.metadata) {
      storedMeta.metadata = this.metadata;
    }

    this.enqueueWrite(async () => {
      const startedAtExists = await this.kv.exists(this.state.startedAtKey);
      if (startedAtExists) {
        await this.kv.expire(this.state.startedAtKey, this.entryTtlSeconds);
      } else {
        await this.kv.set(
          this.state.startedAtKey,
          this.startedAt,
          this.entryTtlSeconds
        );
      }

      const metaExists = await this.kv.exists(this.state.metaKey);
      if (metaExists) {
        await this.kv.expire(this.state.metaKey, this.entryTtlSeconds);
      } else {
        await this.kv.set(this.state.metaKey, storedMeta, this.entryTtlSeconds);
      }
    });
  }

  override log(message: string, level: LogLevel, metadata?: LogMetadata): void {
    this.passthrough?.[level](message, metadata);

    if (this.closed) {
      return;
    }

    const normalizedMetadata = AbstractLogger.serializeLogMetadata(metadata);
    const entry: KvFileLoggerEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };
    if (normalizedMetadata) {
      entry.metadata = normalizedMetadata;
    }

    this.localSeq += 1;

    this.enqueueWrite(async () => {
      const seq = await this.kv.increment(this.state.seqKey, 1);
      await this.kv.set(
        `${this.state.entryPrefix}${seq}`,
        safeJsonStringify(entry),
        this.entryTtlSeconds
      );
      await this.kv.expire(this.state.seqKey, this.entryTtlSeconds);

      if (seq > this.maxEntries) {
        await this.kv.delete(
          `${this.state.entryPrefix}${seq - this.maxEntries}`
        );
        await this.kv.increment(this.state.droppedKey, 1);
        await this.kv.expire(this.state.droppedKey, this.entryTtlSeconds);
      }
    });
  }

  get entryCount(): number {
    return Math.min(this.localSeq, this.maxEntries);
  }

  get storageKey(): string {
    return this.key;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  async close(): Promise<KvFileLoggerCloseResult> {
    if (this.closeResult) {
      return this.closeResult;
    }

    if (this.closePromise) {
      return this.closePromise;
    }

    this.closePromise = this.closeInternal().finally(() => {
      this.closePromise = null;
    });

    return this.closePromise;
  }

  private enqueueWrite(task: () => Promise<void>): void {
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          await task();
        } catch (error) {
          if (!this.firstWriteError) {
            this.firstWriteError = toError(error);
          }
        }
      });
  }

  private async getPersistedCloseResult() {
    return await this.kv.get<KvFileLoggerCloseResult>(
      this.state.closeResultKey
    );
  }

  private async waitForWritesOrThrow(): Promise<void> {
    await this.writeQueue;

    if (this.firstWriteError) {
      throw this.firstWriteError;
    }
  }

  private async buildContent(): Promise<{
    content: string;
    entryCount: number;
    droppedEntryCount: number;
    startedAt: string;
    metadata?: SerializedLogMetadata;
  }> {
    const seqValue = await this.kv.get<number | string>(this.state.seqKey);
    const droppedValue = await this.kv.get<number | string>(
      this.state.droppedKey
    );
    const metaValue = await this.kv.get<KvFileLoggerStoredMeta>(
      this.state.metaKey
    );
    const startedAtValue = await this.kv.get<string>(this.state.startedAtKey);

    const seq = Math.max(0, toNumber(seqValue) ?? 0);
    const droppedEntryCount = Math.max(0, toNumber(droppedValue) ?? 0);
    const from = Math.max(1, seq - this.maxEntries + 1);
    const entryKeys =
      seq === 0
        ? []
        : Array.from({ length: seq - from + 1 }, (_, index) => {
            return `${this.state.entryPrefix}${from + index}`;
          });

    const retainedEntries: string[] = [];
    for (const keyChunk of chunk(entryKeys, DEFAULT_CHUNK_SIZE)) {
      const values = await this.kv.mget<string>(keyChunk);
      for (const value of values) {
        if (value === null) {
          continue;
        }
        retainedEntries.push(
          typeof value === 'string' ? value : safeJsonStringify(value)
        );
      }
    }

    const startedAt = metaValue?.startedAt ?? startedAtValue ?? this.startedAt;
    const metadata = normalizeOutputMetadata(metaValue?.metadata);
    const endedAt = new Date().toISOString();
    const metadataEnvelope: KvFileLoggerMetadataEnvelope = {
      type: 'metadata',
      startedAt,
      endedAt,
      droppedEntryCount,
      maxEntries: this.maxEntries,
      entryCount: retainedEntries.length,
    };
    if (metadata) {
      metadataEnvelope.metadata = metadata;
    }

    const lines = [safeJsonStringify(metadataEnvelope), ...retainedEntries];

    return {
      content: lines.join('\n'),
      entryCount: retainedEntries.length,
      droppedEntryCount,
      startedAt,
      metadata,
    };
  }

  private async clearMediatorKeys(seq: number): Promise<void> {
    const from = Math.max(1, seq - this.maxEntries + 1);
    const entryKeys =
      seq === 0
        ? []
        : Array.from({ length: seq - from + 1 }, (_, index) => {
            return `${this.state.entryPrefix}${from + index}`;
          });

    for (const keyChunk of chunk(entryKeys, DEFAULT_CHUNK_SIZE)) {
      await this.kv.mdelete(keyChunk);
    }

    await this.kv.mdelete([
      this.state.seqKey,
      this.state.droppedKey,
      this.state.startedAtKey,
      this.state.metaKey,
    ]);
  }

  private async closeInternal(): Promise<KvFileLoggerCloseResult> {
    const alreadyClosed = await this.getPersistedCloseResult();
    if (alreadyClosed) {
      this.closed = true;
      this.closeResult = alreadyClosed;
      return alreadyClosed;
    }

    this.closed = true;

    const lock = new KvMutex<string>(this.kv, {
      prefix: '',
      ttlSeconds: this.closeLockTtlSeconds,
    });

    try {
      const result = await lock.withLock(
        this.state.closeLockName,
        async () => {
          const persistedResult = await this.getPersistedCloseResult();
          if (persistedResult) {
            return persistedResult;
          }

          await this.waitForWritesOrThrow();

          const closeData = await this.buildContent();
          await this.storage.write(this.key, Buffer.from(closeData.content), {
            metadata: {
              ...(closeData.metadata ?? {}),
              startedAt: closeData.startedAt,
              endedAt: new Date().toISOString(),
              droppedEntryCount: closeData.droppedEntryCount,
              maxEntries: this.maxEntries,
              entryCount: closeData.entryCount,
            },
          });

          const { url, expiresAt } = await this.storage.createReadPresignedUrl(
            this.key
          );
          const closeResult: KvFileLoggerCloseResult = {
            key: this.key,
            url,
            expiresAt,
            entryCount: closeData.entryCount,
          };

          await this.kv.set(
            this.state.closeResultKey,
            closeResult,
            this.closeResultTtlSeconds
          );

          const seqValue = await this.kv.get<number | string>(
            this.state.seqKey
          );
          const seq = Math.max(0, toNumber(seqValue) ?? 0);
          await this.clearMediatorKeys(seq);

          return closeResult;
        },
        {
          prefix: '',
          ttlSeconds: this.closeLockTtlSeconds,
        }
      );

      this.closeResult = result;
      return result;
    } catch (error) {
      this.closed = false;
      throw error;
    }
  }
}
