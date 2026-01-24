import pino from "pino";

import { AbstractLogger, type LogMetadata } from "./abstract-logger";

/**
 * Pino implementation of AbstractLogger with Axiom transport.
 * Uses `pino` for structured logging and forwards logs to Axiom via `@axiomhq/pino`.
 */
export class AxiomPinoLogger extends AbstractLogger {
  private readonly logger: pino.Logger;

  constructor(options: { dataset: string; token: string }) {
    super();
    this.logger = pino(
      { level: "info" },
      pino.transport({
        target: "@axiomhq/pino",
        options: {
          dataset: options.dataset,
          token: options.token,
        },
      })
    );
  }

  log(
    message: string,
    level: "info" | "warn" | "error",
    metadata?: LogMetadata
  ): void {
    this.logger[level](metadata, message);
  }

  info(message: string, metadata?: LogMetadata): void {
    this.logger.info(metadata, message);
  }

  warn(message: string, metadata?: LogMetadata): void {
    this.logger.warn(metadata, message);
  }

  error(message: string, metadata?: LogMetadata): void {
    this.logger.error(metadata, message);
  }
}
