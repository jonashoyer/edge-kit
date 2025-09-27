import pino from "pino";

import { AbstractLogger } from "./abstract-logger";

type LogMetadata = Record<string, string | number | boolean | null | undefined>;

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
