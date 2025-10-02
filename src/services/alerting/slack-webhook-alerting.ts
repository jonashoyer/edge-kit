import { fetchExt } from "../../utils/fetch-utils";
import type { AbstractLogger } from "../logging/abstract-logger";
import {
  AbstractAlertingService,
  type AlertOptions,
} from "./abstract-alerting";

/**
 * @deprecated Prefer using `SlackAlertingService` which delegates to the Notification abstraction.
 */
export class SlackWebhookAlertingService extends AbstractAlertingService {
  private readonly webhookUrl: string;
  private readonly channel: string;
  private readonly fields?: { title: string; value: string; short?: boolean }[];

  constructor(
    webhookUrl: string,
    channel: string,
    logger: AbstractLogger,
    fields?: { title: string; value: string; short?: boolean }[]
  ) {
    super(logger);
    this.webhookUrl = webhookUrl;
    this.channel = channel;
    this.fields = fields;
  }

  async alert(message: string, options: AlertOptions): Promise<void> {
    const color = this.getSeverityColor(options.severity);
    const payload = {
      channel: this.channel,
      attachments: [
        {
          color,
          text: message,
          fields: [
            ...(this.fields ?? []),
            { title: "Severity", value: options.severity, short: true },
            { title: "Source", value: options.source || "N/A", short: true },
            ...Object.entries(options.tags || {}).map(([key, value]) => ({
              title: key,
              value,
              short: true,
            })),
          ],
        },
      ],
    };

    await fetchExt({
      url: this.webhookUrl,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    });

    this.logAlert(message, options);
  }

  private getSeverityColor(severity: AlertOptions["severity"]): string {
    switch (severity) {
      case "info":
        return "#2196F3";
      case "warning":
        return "#FFC107";
      case "error":
        return "#F44336";
      case "critical":
        return "#9C27B0";
      default:
        return "#9E9E9E";
    }
  }

  formatCodeblock(code: string | object): string {
    return `\`\`\`${typeof code === "string" ? code : JSON.stringify(code, null, 2)}\`\`\``;
  }
}
