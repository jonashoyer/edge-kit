import { Axiom } from '@axiomhq/js';

import {
  AbstractLogger,
  type LogLevel,
  type LogMetadata,
} from './abstract-logger';

export interface AxiomLoggerOptions {
  token: string;
  dataset: string;
}

/**
 * Axiom implementation of AbstractLogger.
 * Ingests logs directly into an Axiom dataset using the `@axiomhq/js` client.
 */
export class AxiomLogger extends AbstractLogger {
  private readonly client: Axiom;
  private readonly dataset: string;

  /**
   * @param token Axiom token
   * @param dataset Axiom dataset (e.g. 'main')
   */
  constructor(options: AxiomLoggerOptions);
  constructor(token: string, dataset: string);
  constructor(tokenOrOptions: AxiomLoggerOptions | string, dataset?: string) {
    super();
    const options =
      typeof tokenOrOptions === 'string'
        ? { token: tokenOrOptions, dataset: dataset ?? '' }
        : tokenOrOptions;
    if (!options.dataset) {
      throw new Error('AxiomLogger dataset is required');
    }
    this.client = new Axiom({
      token: options.token,
    });
    this.dataset = options.dataset;
  }

  override log(message: string, level: LogLevel, metadata?: LogMetadata): void {
    const normalizedMetadata = AbstractLogger.serializeLogMetadata(metadata);
    this.client.ingest(this.dataset, [
      {
        level,
        message,
        ...(normalizedMetadata ?? {}),
        timestamp: new Date().toISOString(),
      },
    ]);
  }
}
