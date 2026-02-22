import pino from 'pino';

import {
  AbstractLogger,
  type LogLevel,
  type LogMetadata,
} from './abstract-logger';

/**
 * Pino implementation of AbstractLogger with Axiom transport.
 * Uses `pino` for structured logging and forwards logs to Axiom via `@axiomhq/pino`.
 */
export class AxiomPinoLogger extends AbstractLogger {
  private readonly logger: pino.Logger;

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

  override log(message: string, level: LogLevel, metadata?: LogMetadata): void {
    const normalizedMetadata = AbstractLogger.serializeLogMetadata(metadata);
    this.logger[level](normalizedMetadata, message);
  }
}
