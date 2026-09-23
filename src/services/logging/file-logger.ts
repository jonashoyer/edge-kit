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
} from './logger-utils';

const DEFAULT_MAX_ENTRIES = 10_000;

interface FileLoggerMetadataEnvelope {
  droppedEntryCount: number;
  endedAt: string;
  entryCount: number;
  maxEntries: number;
  metadata?: SerializedLogMetadata;
  startedAt: string;
  type: 'metadata';
}

export interface FileLoggerEntry {
  level: LogLevel;
  message: string;
  metadata?: SerializedLogMetadata;
  timestamp: string;
}

export interface FileLoggerOptions {
  key: string;
  maxEntries?: number;
  metadata?: Record<string, unknown>;
  passthrough?: StandardLogger;
  storage: AbstractStorage;
}

export interface FileLoggerCloseResult {
  entryCount: number;
  expiresAt: number;
  key: string;
  url: string;
}

export class FileLogger extends AbstractLogger {
  private readonly entries: FileLoggerEntry[] = [];
  private readonly storage: AbstractStorage;
  private readonly key: string;
  private readonly metadata?: SerializedLogMetadata;
  private readonly passthrough?: StandardLogger;
  private readonly startedAt: string;
  private readonly maxEntries: number;
  private droppedEntryCount = 0;
  private closed = false;
  private closeResult: FileLoggerCloseResult | null = null;
  private closePromise: Promise<FileLoggerCloseResult> | null = null;

  constructor(options: FileLoggerOptions) {
    super();

    if (
      options.maxEntries !== undefined &&
      !Number.isInteger(options.maxEntries)
    ) {
      throw new Error('FileLogger maxEntries must be an integer');
    }
    if (options.maxEntries !== undefined && options.maxEntries <= 0) {
      throw new Error('FileLogger maxEntries must be greater than 0');
    }

    this.storage = options.storage;
    this.passthrough = options.passthrough;
    this.key = options.key;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.startedAt = new Date().toISOString();
    this.metadata = AbstractLogger.serializeLogMetadata(options.metadata);
  }

  override log(message: string, level: LogLevel, metadata?: LogMetadata): void {
    this.passthrough?.[level](message, metadata);

    // biome-ignore lint/suspicious/noUnnecessaryConditions: close() mutates this state outside the current method.
    if (this.closed) {
      return;
    }

    const normalizedMetadata = AbstractLogger.serializeLogMetadata(metadata);
    const entry: FileLoggerEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
    };

    if (normalizedMetadata) {
      entry.metadata = normalizedMetadata;
    }

    this.entries.push(entry);

    if (this.entries.length > this.maxEntries) {
      const overflowCount = this.entries.length - this.maxEntries;
      this.entries.splice(0, overflowCount);
      this.droppedEntryCount += overflowCount;
    }
  }

  get entryCount(): number {
    return this.entries.length;
  }

  get storageKey(): string {
    return this.key;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  async close(): Promise<FileLoggerCloseResult> {
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

  private async closeInternal(): Promise<FileLoggerCloseResult> {
    if (this.closeResult) {
      return this.closeResult;
    }

    this.closed = true;

    try {
      const endedAt = new Date().toISOString();
      const metadataEnvelope: FileLoggerMetadataEnvelope = {
        droppedEntryCount: this.droppedEntryCount,
        endedAt,
        entryCount: this.entries.length,
        maxEntries: this.maxEntries,
        startedAt: this.startedAt,
        type: 'metadata',
      };

      if (this.metadata) {
        metadataEnvelope.metadata = this.metadata;
      }

      const lines: string[] = [safeJsonStringify(metadataEnvelope)];
      for (const entry of this.entries) {
        const normalized: FileLoggerEntry = {
          level: entry.level,
          message:
            typeof entry.message === 'string'
              ? entry.message
              : String(entry.message),
          timestamp:
            typeof entry.timestamp === 'string'
              ? entry.timestamp
              : String(entry.timestamp),
        };
        const outputMetadata = normalizeOutputMetadata(entry.metadata);
        if (outputMetadata) {
          normalized.metadata = outputMetadata;
        }
        lines.push(safeJsonStringify(normalized));
      }
      const content = lines.join('\n');

      await this.storage.write(this.key, Buffer.from(content), {
        metadata: {
          ...(this.metadata ?? {}),
          droppedEntryCount: this.droppedEntryCount,
          endedAt,
          entryCount: this.entries.length,
          maxEntries: this.maxEntries,
          startedAt: this.startedAt,
        },
      });

      const { url, expiresAt } = await this.storage.createReadPresignedUrl(
        this.key
      );

      const result: FileLoggerCloseResult = {
        entryCount: this.entries.length,
        expiresAt,
        key: this.key,
        url,
      };

      this.closeResult = result;

      return result;
    } catch (error) {
      this.closed = false;
      throw error;
    }
  }
}
