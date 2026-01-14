import type { AbstractStorage } from "../storage/abstract-storage";
import { AbstractLogger, type LogLevel } from "./abstract-logger";

export interface LogFileEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  data?: Record<string, unknown>;
}

export interface LogFileServiceParams {
  key: string;
  storage: AbstractStorage;
  metadata?: Record<string, unknown>;

  /** Optional passthrough logger - all logs will be forwarded here */
  passthrough?: AbstractLogger;
}

/**
 * A debug log service that buffers log entries in memory and uploads to object storage on close.
 * Implements the Logger interface so it can be used as a drop-in replacement for existing loggers.
 * Optionally forwards all logs to a passthrough logger.
 * Returns a signed download URL after upload.
 */
export class LogFileService extends AbstractLogger {
  private readonly entries: LogFileEntry[] = [];
  private readonly storage: AbstractStorage;
  private readonly key: string;
  private readonly metadata: Record<string, unknown>;
  private closed = false;
  private readonly passthrough?: AbstractLogger;

  constructor(params: LogFileServiceParams) {
    super();
    this.storage = params.storage;
    this.passthrough = params.passthrough;
    this.key = params.key;
    this.metadata = {
      ...(params.metadata ?? {}),
      startedAt: new Date().toISOString(),
    };
  }

  /**
   * Log an entry at the specified level.
   * Also forwards to passthrough logger if configured.
   */
  override log(
    event: string,
    level: LogLevel,
    data?: Record<string, unknown>
  ): void {
    // Forward to passthrough logger
    this.passthrough?.[level](event, data);

    if (this.closed) {
      return;
    }

    this.entries.push({
      timestamp: new Date().toISOString(),
      level,
      event,
      data,
    });
  }

  /**
   * Get the current entry count
   */
  get entryCount(): number {
    return this.entries.length;
  }

  /**
   * Get the storage key (useful for logging before close)
   */
  get storageKey(): string {
    return this.key;
  }

  /**
   * Check if the log has been closed
   */
  get isClosed(): boolean {
    return this.closed;
  }

  /**
   * Upload the log file to storage and return a signed download URL.
   * After close, no more entries can be added.
   */
  async close() {
    if (this.closed) {
      throw new Error("DebugLogService: Already closed");
    }

    this.closed = true;

    // Build JSONL content: metadata line + entry lines
    const lines = this.entries.map((entry) => JSON.stringify(entry));
    const content = lines.join("\n");

    // Upload log file
    await this.storage.write(this.key, Buffer.from(content), {
      metadata: {
        ...this.metadata,
        endedAt: new Date().toISOString(),
      },
    });

    return {
      key: this.key,
      logCount: this.entries.length,
      metadata: this.metadata,
    };
  }
}
