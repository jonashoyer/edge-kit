export type LogValue = string | number | boolean | null | undefined;
export type LogMetadata = Record<string, LogValue | Record<string, LogValue>>;

export abstract class AbstractLogger {
  abstract log(
    message: string,
    level: "info" | "warn" | "error",
    metadata?: LogMetadata
  ): void;
  abstract info(message: string, metadata?: LogMetadata): void;
  abstract warn(message: string, metadata?: LogMetadata): void;
  abstract error(message: string, metadata?: LogMetadata): void;
}
