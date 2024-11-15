import { AbstractLogger } from "./abstract-logger";
import pino from 'pino';

export class AxiomPinoLogger extends AbstractLogger {
  private logger: pino.Logger;

  constructor(options: { dataset: string; token: string }) {
    super();
    this.logger = pino(
      { level: 'info' },
      pino.transport({
        target: '@axiomhq/pino',
        options: {
          dataset: options.dataset,
          token: options.token,
        },
      })
    );
  }

  log(message: string, level: 'info' | 'warn' | 'error', metadata?: Record<string, any>): void {
    this.logger[level](metadata, message);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.logger.info(metadata, message);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.logger.warn(metadata, message);
  }

  error(message: string, metadata?: Record<string, any>): void {
    this.logger.error(metadata, message);
  }
}