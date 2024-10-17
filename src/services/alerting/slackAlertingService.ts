import { AbstractAlertingService, AlertOptions } from './abstractAlertingService';
import { AbstractLogger } from '../logging/abstractLogger';
import { fetchExt } from '../../utils/miscUtils';

export class SlackAlertingService extends AbstractAlertingService {
  constructor(
    private webhookUrl: string,
    private channel: string,
    logger: AbstractLogger,
    private fields?: { title: string; value: string; short?: boolean }[]
  ) {
    super(logger);
  }

  async alert(message: string, options: AlertOptions): Promise<void> {
    const color = this.getSeverityColor(options.severity);
    const payload = {
      channel: this.channel,
      attachments: [{
        color,
        text: message,
        fields: [
          ...(this.fields ?? []),
          { title: 'Severity', value: options.severity, short: true },
          { title: 'Source', value: options.source || 'N/A', short: true },
          ...Object.entries(options.tags || {}).map(([key, value]) => ({
            title: key,
            value,
            short: true,
          })),
        ],
      }],
    };

    await fetchExt({
      url: this.webhookUrl,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    });

    this.logAlert(message, options);
  }

  private getSeverityColor(severity: AlertOptions['severity']): string {
    switch (severity) {
      case 'info': return '#2196F3';
      case 'warning': return '#FFC107';
      case 'error': return '#F44336';
      case 'critical': return '#9C27B0';
    }
  }

  public formatCodeblock(code: string | object): string {
    return `\`\`\`${typeof code == 'string' ? code : JSON.stringify(code, null, 2)}\`\`\``;
  }
}
