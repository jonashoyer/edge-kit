import { AbstractLogger } from '../logging/abstract-logger';

export interface AlertOptions {
  severity: 'info' | 'warning' | 'error' | 'critical';
  source?: string;
  tags?: Record<string, string>;
}

export abstract class AbstractAlertingService {
  constructor(protected logger: AbstractLogger) {}

  abstract alert(message: string, options: AlertOptions): Promise<void>;

  protected logAlert(message: string, options: AlertOptions): void {
    const logLevel = options.severity === 'info' ? 'info' : options.severity === 'warning' ? 'warn' : 'error';
    this.logger.log(message, logLevel, {
      alertSeverity: options.severity,
      alertSource: options.source,
      alertTags: options.tags,
    });
  }
}
