import { Axiom } from "@axiomhq/js";

import type { AbstractLogger } from "./abstract-logger";

type LogMetadata = Record<string, string | number | boolean | null | undefined>;

export class AxiomLogger implements AbstractLogger {
  private readonly client: Axiom;
  private readonly dataset: string;

  /**
   * @param token Axiom token
   * @param dataset Axiom dataset (e.g. 'main')
   */
  constructor(token: string, dataset: string) {
    this.client = new Axiom({
      token,
    });
    this.dataset = dataset;
  }

  log(message: string, level: "info" | "warn" | "error", metadata?: LogMetadata) {
    this.client.ingest(this.dataset, [
      {
        level,
        message,
        ...metadata,
        timestamp: new Date().toISOString(),
      },
    ]);
  }

  info(message: string, metadata?: LogMetadata) {
    this.log(message, "info", metadata);
  }

  warn(message: string, metadata?: LogMetadata) {
    this.log(message, "warn", metadata);
  }

  error(message: string, metadata?: LogMetadata) {
    this.log(message, "error", metadata);
  }
}
