/** biome-ignore-all lint/style/noMagicNumbers: SlackNotificationService */
import { format } from "node:util";

import { fetchExt } from "../../utils/fetch-utils";
import type { AbstractLogger } from "../logging/abstract-logger";
import {
  AbstractNotificationService,
  type NotificationPayload,
  type NotificationResponse,
  type TextNotification,
} from "./abstract-notification";

export type SlackBlock = Record<string, unknown>;
export type SlackBlockElement = Record<string, unknown>;

export type SlackNotificationOptions = {
  timeoutMs?: number;
  retries?: number;
  retryDelay?: number;
};

export class SlackNotificationService extends AbstractNotificationService {
  private readonly botToken: string;
  private readonly defaultChannelId: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly retryDelay: number;

  constructor(
    botToken: string,
    defaultChannelId: string,
    logger?: AbstractLogger,
    options?: SlackNotificationOptions
  ) {
    super(logger);
    this.botToken = botToken;
    this.defaultChannelId = defaultChannelId;
    this.timeoutMs = options?.timeoutMs ?? 10_000;
    this.retries = options?.retries ?? 2;
    this.retryDelay = options?.retryDelay ?? 400;
  }

  async send(payload: NotificationPayload): Promise<NotificationResponse> {
    const body = this.buildBody(payload);

    const res = await fetchExt({
      url: "https://slack.com/api/chat.postMessage",
      timeout: this.timeoutMs,
      retries: this.retries,
      retryDelay: this.retryDelay,
      init: {
        method: "POST",
        headers: {
          "Content-type": "application/json; charset=utf-8",
          Authorization: `Bearer ${this.botToken}`,
        },
        body: JSON.stringify(body),
      },
    });

    if (!res.ok) {
      const message = `Slack postMessage HTTP ${res.status}`;
      this.logger?.error(message, { status: res.status });
      throw new Error(message);
    }

    const data = (await res.json()) as NotificationResponse & {
      ok: boolean;
      error?: string;
    };
    if (!data.ok) {
      const message = `Slack API error: ${data.error ?? "unknown"}`;
      this.logger?.error(message);
      throw new Error(message);
    }

    this.logger?.info("Slack message sent", {
      channel: data.channel,
      ts: data.ts,
    });
    return data;
  }

  async sendText(
    message?: unknown,
    ...optionalParams: unknown[]
  ): Promise<NotificationResponse> {
    const text = format(message as string, ...optionalParams);
    return await this.send({ text } satisfies TextNotification);
  }

  // Formatting helpers
  createButton(text: string, url: string): SlackBlockElement {
    return {
      type: "button",
      text: { type: "plain_text", text },
      url,
    };
  }

  createSection(text: string): SlackBlock {
    return {
      type: "section",
      text: { type: "mrkdwn", text },
    };
  }

  createDivider(): SlackBlock {
    return { type: "divider" };
  }

  private buildBody(payload: NotificationPayload): Record<string, unknown> {
    const channel = payload.channel ?? this.defaultChannelId;
    if (isText(payload)) {
      return { channel, text: payload.text };
    }
    return { channel, blocks: payload.blocks };
  }
}

function isText(payload: NotificationPayload): payload is TextNotification {
  return (payload as TextNotification).text !== undefined;
}
