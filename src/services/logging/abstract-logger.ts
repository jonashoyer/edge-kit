import { serializeError } from "../../utils/error-utils";

export type LoggablePrimitive = string | number | boolean | null | undefined;
export type LogMetadata = Record<
  string,
  unknown | LoggablePrimitive | Record<string, LoggablePrimitive>
>;

export type LogLevel = "debug" | "info" | "warn" | "error";

export type StandardLogger = Record<
  LogLevel,
  (message: string, metadata?: LogMetadata) => void
>;

/**
 * Abstract base class for logging services.
 * Defines standard log levels (debug, info, warn, error) and metadata handling.
 * Includes helpers for serializing log values and errors.
 */
export abstract class AbstractLogger implements StandardLogger {
  abstract log(message: string, level: LogLevel, metadata?: LogMetadata): void;
  debug(message: string, metadata?: LogMetadata) {
    this.log(message, "debug", metadata);
  }
  info(message: string, metadata?: LogMetadata) {
    this.log(message, "info", metadata);
  }
  warn(message: string, metadata?: LogMetadata) {
    this.log(message, "warn", metadata);
  }
  error(message: string, metadata?: LogMetadata) {
    this.log(message, "error", metadata);
  }

  static serializeLogValue(value: unknown) {
    if (value instanceof Error) {
      return serializeError(value);
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value == null
    ) {
      return value;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  static serializeLogMetadata(metadata?: LogMetadata) {
    if (!metadata) return;

    return Object.fromEntries(
      Object.entries(metadata).map(([key, value]) => {
        return [key, AbstractLogger.serializeLogValue(value)];
      })
    ) as Record<string, LoggablePrimitive | Record<string, LoggablePrimitive>>;
  }
}
