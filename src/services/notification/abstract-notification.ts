import type { AbstractLogger } from "../logging/abstract-logger";

export type TextNotification = {
  text: string;
  channel?: string;
};

export type BlockNotification = {
  blocks: unknown[];
  channel?: string;
};

export type NotificationPayload = TextNotification | BlockNotification;

export type NotificationResponse = {
  ok: boolean;
  channel: string;
  ts: string;
  message?: unknown;
};

/**
 * Abstract base class for notification services.
 * Defines the contract for sending text or block-based notifications (e.g. Slack, Email).
 */
export abstract class AbstractNotificationService {
  protected readonly logger?: AbstractLogger;

  constructor(logger?: AbstractLogger) {
    this.logger = logger;
  }

  abstract send(payload: NotificationPayload): Promise<NotificationResponse>;
}
