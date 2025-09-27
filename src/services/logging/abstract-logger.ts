type LogMetadata = Record<string, string | number | boolean | null | undefined>;

export abstract class AbstractLogger {
  abstract log(message: string, level: 'info' | 'warn' | 'error', metadata?: LogMetadata): void;
  abstract info(message: string, metadata?: LogMetadata): void;
  abstract warn(message: string, metadata?: LogMetadata): void;
  abstract error(message: string, metadata?: LogMetadata): void;
}
