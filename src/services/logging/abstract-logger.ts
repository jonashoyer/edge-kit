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
      return AbstractLogger.serializeError(value);
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

  static serializeError(err: unknown) {
    if (err instanceof Error) {
      // Extract safe, loggable bits; flatten unknown values to strings
      const anyErr = err as Error & { code?: unknown; cause?: unknown };
      const code = anyErr.code;
      const cause = anyErr.cause;

      const parseCause = (cause: unknown) => {
        if (cause instanceof Error) {
          return cause.message;
        }
        if (typeof cause === "string") {
          return cause;
        }
      };

      return {
        name: err.name,
        message: err.message,
        stack: err.stack ?? undefined,
        code:
          typeof code === "string" || typeof code === "number"
            ? code
            : undefined,
        cause: parseCause(cause),
      };
    }

    // Handle non-Error throwables
    if (
      typeof err === "string" ||
      typeof err === "number" ||
      typeof err === "boolean" ||
      err == null
    ) {
      return { message: String(err) };
    }

    try {
      return { message: JSON.stringify(err) };
    } catch {
      return { message: "[unserializable error]" };
    }
  }
}
