import {
  AbstractLogger,
  type LogLevel,
  type LogMetadata,
} from './abstract-logger';

/**
 * Simple console implementation of AbstractLogger.
 * Outputs logs to `console.info`, `console.warn`, and `console.error`.
 * Useful for local development.
 */
export class ConsoleLogger extends AbstractLogger {
  override log(message: string, level: LogLevel, metadata?: LogMetadata): void {
    const logMessage = `[${level.toUpperCase()}] ${message}`;
    const normalizedMetadata = AbstractLogger.serializeLogMetadata(metadata);
    console[level](logMessage, normalizedMetadata);
  }
}
