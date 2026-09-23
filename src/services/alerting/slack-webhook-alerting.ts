import { fetchExt } from '../../utils/fetch-utils';
import type { AbstractLogger } from '../logging/abstract-logger';
import {
  AbstractAlertingService,
  type AlertOptions,
} from './abstract-alerting';

/**
 * @deprecated Prefer using `SlackAlertingService` which delegates to the Notification abstraction.
 */
export class SlackWebhookAlertingService extends AbstractAlertingService {
  private readonly webhookUrl: string;
  private readonly channel: string;
  private readonly fields?: { title: string; value: string; short?: boolean }[];
  private readonly environment?: string;

  constructor(
    webhookUrl: string,
    channel: string,
    logger: AbstractLogger,
    config?: {
      fields?: { title: string; value: string; short?: boolean }[];
      environment?: string;
    }
  ) {
    super(logger);
    this.webhookUrl = webhookUrl;
    this.channel = channel;
    this.fields = config?.fields;
    this.environment = config?.environment;
  }

  async alert(message: string, options: AlertOptions): Promise<void> {
    const color = this.getSeverityColor(options.severity);
    const envPrefix = this.environment
      ? `[${this.environment.toUpperCase()}] `
      : '';
    const payload = {
      attachments: [
        {
          color,
          fields: [
            ...(this.fields ?? []),
            { short: true, title: 'Severity', value: options.severity },
            { short: true, title: 'Source', value: options.source || 'N/A' },
            ...Object.entries(options.tags || {}).map(([key, value]) => ({
              short: true,
              title: key,
              value,
            })),
          ],
          text: `${envPrefix}${message}`,
        },
      ],
      channel: this.channel,
    };

    await fetchExt({
      init: {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
      url: this.webhookUrl,
    });

    this.logAlert(message, options);
  }

  private getSeverityColor(severity: AlertOptions['severity']): string {
    switch (severity) {
      case 'info':
        return '#2196F3';
      case 'warning':
        return '#FFC107';
      case 'error':
        return '#F44336';
      case 'critical':
        return '#9C27B0';
      default:
        return '#9E9E9E';
    }
  }

  formatCodeblock(code: string | object): string {
    return `\`\`\`${typeof code === 'string' ? code : JSON.stringify(code, null, 2)}\`\`\``;
  }
}
