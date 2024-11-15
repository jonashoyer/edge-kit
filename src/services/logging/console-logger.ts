import { AbstractLogger } from './abstract-logger';

export class ConsoleLogger extends AbstractLogger {
  log(message: string, level: 'info' | 'warn' | 'error', metadata?: Record<string, any>): void {
    const logMessage = `[${level.toUpperCase()}] ${message}`;
    console[level](logMessage, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.log(message, 'info', metadata);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.log(message, 'warn', metadata);
  }

  error(message: string, metadata?: Record<string, any>): void {
    this.log(message, 'error', metadata);
  }
}