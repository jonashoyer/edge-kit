import { Axiom } from "@axiomhq/js";

import type { AbstractLogger } from "../logging/abstract-logger";
import {
  AbstractAlertingService,
  type AlertOptions,
} from "./abstract-alerting";

export class AxiomAlertingService extends AbstractAlertingService {
  private readonly client: Axiom;
  private readonly dataset: string;

  constructor(token: string, dataset: string, logger: AbstractLogger) {
    super(logger);
    this.client = new Axiom({ token });
    this.dataset = dataset;
  }

  // biome-ignore lint/suspicious/useAwait: Axiom ingest is not async
  async alert(message: string, options: AlertOptions) {
    this.client.ingest(this.dataset, [
      {
        severity: options.severity,
        message,
        source: options.source,
        ...options.tags,
        timestamp: new Date().toISOString(),
      },
    ]);

    this.logAlert(message, options);
  }
}
