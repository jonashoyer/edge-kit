import { fetchExt } from "../../utils/fetch-utils";
import type { AbstractLogger } from "../logging/abstract-logger";
import {
  AbstractAlertingService,
  type AlertOptions,
} from "./abstract-alerting";

export class PagerDutyAlertingService extends AbstractAlertingService {
  private readonly routingKey: string;
  private readonly apiUrl = "https://events.pagerduty.com/v2/enqueue";
  constructor(routingKey: string, logger: AbstractLogger) {
    super(logger);
    this.routingKey = routingKey;
  }

  async alert(message: string, options: AlertOptions): Promise<void> {
    const payload = {
      routing_key: this.routingKey,
      event_action: "trigger",
      payload: {
        summary: message,
        severity: options.severity,
        source: options.source || "Application",
        custom_details: options.tags,
      },
    };

    await fetchExt({
      url: this.apiUrl,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    });

    this.logAlert(message, options);
  }
}
