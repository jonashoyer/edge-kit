import { serializeError } from "../../utils/error-utils";

export type LoggablePrimitive = string | number | boolean | null | undefined;
export type LogMetadata = Record<
  string,
  unknown | LoggablePrimitive | Record<string, LoggablePrimitive>
>;

export abstract class AbstractLogger {
  abstract log(
    message: string,
    level: "info" | "warn" | "error",
    metadata?: LogMetadata
  ): void;
  abstract info(message: string, metadata?: LogMetadata): void;
  abstract warn(message: string, metadata?: LogMetadata): void;
  abstract error(message: string, metadata?: LogMetadata): void;

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
