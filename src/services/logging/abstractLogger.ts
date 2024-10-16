export abstract class AbstractLogger {
  abstract log(message: string, level: 'info' | 'warn' | 'error', metadata?: Record<string, any>): void;
  abstract info(message: string, metadata?: Record<string, any>): void;
  abstract warn(message: string, metadata?: Record<string, any>): void;
  abstract error(message: string, metadata?: Record<string, any>): void;
}