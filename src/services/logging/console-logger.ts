import { AbstractLogger, type LogMetadata } from "./abstract-logger";

export class ConsoleLogger extends AbstractLogger {
  log(
    message: string,
    level: "info" | "warn" | "error",
    metadata?: LogMetadata
  ): void {
    const logMessage = `[${level.toUpperCase()}] ${message}`;
    // biome-ignore lint/suspicious/noConsole: This is a console logger
    console[level](logMessage, metadata);
  }

  info(message: string, metadata?: LogMetadata): void {
    this.log(message, "info", metadata);
  }

  warn(message: string, metadata?: LogMetadata): void {
    this.log(message, "warn", metadata);
  }

  error(message: string, metadata?: LogMetadata): void {
    this.log(message, "error", metadata);
  }
}
