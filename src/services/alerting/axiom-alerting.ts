import { AbstractAlertingService, AlertOptions } from './abstract-alerting';
import { AbstractLogger } from '../logging/abstract-logger';
import { Axiom } from '@axiomhq/js';

export class AxiomAlertingService extends AbstractAlertingService {
  private client: Axiom;
  private dataset: string;

  constructor(token: string, dataset: string, logger: AbstractLogger) {
    super(logger);
    this.client = new Axiom({ token });
    this.dataset = dataset;
  }

  async alert(message: string, options: AlertOptions): Promise<void> {
    await this.client.ingest(this.dataset, [{
      severity: options.severity,
      message,
      source: options.source,
      ...options.tags,
      timestamp: new Date().toISOString(),
    }]);

    this.logAlert(message, options);
  }
}
