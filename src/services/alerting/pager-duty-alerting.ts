import { fetchExt } from '../../utils/fetch-utils';
import type { AbstractLogger } from '../logging/abstract-logger';
import {
  AbstractAlertingService,
  type AlertOptions,
} from './abstract-alerting';

/**
 * PagerDuty implementation of the AbstractAlertingService.
 * Triggers events in PagerDuty via the Events API v2 using a routing key.
 */
export class PagerDutyAlertingService extends AbstractAlertingService {
  private readonly routingKey: string;
  private readonly apiUrl = 'https://events.pagerduty.com/v2/enqueue';
  constructor(routingKey: string, logger: AbstractLogger) {
    super(logger);
    this.routingKey = routingKey;
  }

  async alert(message: string, options: AlertOptions): Promise<void> {
    const payload = {
      event_action: 'trigger',
      payload: {
        custom_details: options.tags,
        severity: options.severity,
        source: options.source || 'Application',
        summary: message,
      },
      routing_key: this.routingKey,
    };

    await fetchExt({
      init: {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
      url: this.apiUrl,
    });

    this.logAlert(message, options);
  }
}
