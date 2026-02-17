import type { AbstractLogger } from '../logging/abstract-logger';
import type { AbstractNotificationService } from '../notification/abstract-notification';
import type { SlackBlock } from '../notification/slack-notification';
import {
  AbstractAlertingService,
  type AlertOptions,
} from './abstract-alerting';

/**
 * Slack implementation of the AbstractAlertingService.
 * Sends formatted alerts (with severity emojis and metadata fields) to a Slack channel
 * using an injected AbstractNotificationService.
 */
export class SlackAlertingService extends AbstractAlertingService {
  private readonly notification: AbstractNotificationService;
  private readonly channel: string | undefined;
  private readonly fields?: { title: string; value: string; short?: boolean }[];
  private readonly environment?: string;

  constructor(
    notification: AbstractNotificationService,
    channel: string | undefined,
    logger?: AbstractLogger,
    config?: {
      fields?: { title: string; value: string; short?: boolean }[];
      environment?: string;
    }
  ) {
    super(logger as AbstractLogger);
    this.notification = notification;
    this.channel = channel;
    this.fields = config?.fields;
    this.environment = config?.environment;
  }

  async alert(message: string, options: AlertOptions): Promise<void> {
    const blocks = this.buildBlocks(message, options);
    await this.notification.send({ channel: this.channel, blocks });
    this.logAlert(message, options);
  }

  private buildBlocks(message: string, options: AlertOptions): SlackBlock[] {
    const envPrefix = this.environment
      ? `[${this.environment.toUpperCase()}] `
      : '';
    const header = this.createSection(
      `${envPrefix}${this.getSeverityEmoji(options.severity)} ${message}`
    );
    const fields = this.collectFields(options);
    const fieldsMrkdwn = fields
      .map((f) => `*${f.title}:* ${f.value}`)
      .join('\n');
    return [header, this.createDivider(), this.createSection(fieldsMrkdwn)];
  }

  private collectFields(options: AlertOptions) {
    const base = [
      { title: 'Severity', value: options.severity, short: true },
      { title: 'Source', value: options.source ?? 'N/A', short: true },
    ];
    const tags = Object.entries(options.tags ?? {}).map(([key, value]) => ({
      title: key,
      value,
      short: true,
    }));
    return [...(this.fields ?? []), ...base, ...tags];
  }

  private getSeverityEmoji(severity: AlertOptions['severity']): string {
    switch (severity) {
      case 'info':
        return ':information_source:';
      case 'warning':
        return ':warning:';
      case 'error':
        return ':interrobang:';
      case 'critical':
        return ':rotating_light:';
      default:
        return ':speech_balloon:';
    }
  }

  // Lightweight helpers aligned with SlackNotificationService
  private createSection(text: string): SlackBlock {
    return { type: 'section', text: { type: 'mrkdwn', text } } as SlackBlock;
  }

  private createDivider(): SlackBlock {
    return { type: 'divider' } as SlackBlock;
  }

  formatCodeblock(code: string | object): string {
    return `\`\`\`${typeof code === 'string' ? code : JSON.stringify(code, null, 2)}\`\`\``;
  }
}
