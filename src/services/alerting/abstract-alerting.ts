import type { AbstractLogger } from '../logging/abstract-logger';

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';
export interface AlertOptions {
  severity: AlertSeverity;
  source?: string;
  tags?: Record<string, string>;
}

/**
 * Abstract base class for alerting services.
 * Defines the contract for sending alerts with varying severity levels (info, warning, error, critical).
 * Delegates logging to an injected AbstractLogger.
 */
export abstract class AbstractAlertingService {
  protected readonly logger: AbstractLogger;
  constructor(logger: AbstractLogger) {
    this.logger = logger;
  }

  abstract alert(message: string, options: AlertOptions): Promise<void>;

  private getLogLevel(
    severity: AlertOptions['severity']
  ): 'info' | 'warn' | 'error' {
    if (severity === 'info') return 'info';
    if (severity === 'warning') return 'warn';
    return 'error';
  }

  protected logAlert(message: string, options: AlertOptions): void {
    const logLevel = this.getLogLevel(options.severity);
    this.logger.log(message, logLevel, {
      alertSeverity: options.severity,
      alertSource: options.source,
      alertTags: options.tags,
    });
  }
}
