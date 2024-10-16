import { AbstractLogger } from './abstractLogger';
import { Axiom } from '@axiomhq/js';

export class AxiomLogger implements AbstractLogger {
  private client: Axiom;
  private dataset: string;

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

  async log(message: string, level: string, metadata?: Record<string, any>) {
    this.client.ingest(this.dataset, [{
      level,
      message,
      ...metadata,
      timestamp: new Date().toISOString(),
    }]);
  }

  async info(message: string, metadata?: Record<string, any>): Promise<void> {
    await this.log('info', message, metadata);
  }

  async warn(message: string, metadata?: Record<string, any>): Promise<void> {
    await this.log('warn', message, metadata);
  }

  async error(message: string, metadata?: Record<string, any>): Promise<void> {
    await this.log('error', message, metadata);
  }
}
