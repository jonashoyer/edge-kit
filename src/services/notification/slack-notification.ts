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
type SlackApiOk = { ok: true };
type SlackApiErr = { ok: false; error?: string };
type SlackApiResponse<
  T extends Record<string, unknown> = Record<string, unknown>,
> = (T & SlackApiOk) | SlackApiErr;

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

    const data = await this.slackApi<NotificationResponse>(
      "chat.postMessage",
      body
    );

    this.logger?.info("Slack message sent", {
      channel: data.channel,
      ts: data.ts,
    });
    return data;
  }

  async update(
    channelId: string,
    ts: string,
    payload: { blocks?: unknown[]; text?: string }
  ): Promise<void> {
    await this.slackApi("chat.update", {
      channel: channelId,
      ts,
      blocks: payload.blocks,
      text: payload.text ?? " ",
    });
  }

  async postEphemeral(
    channelId: string,
    userId: string,
    payload: { text?: string; blocks?: unknown[] }
  ): Promise<void> {
    await this.slackApi("chat.postEphemeral", {
      channel: channelId,
      user: userId,
      text: payload.text ?? " ",
      blocks: payload.blocks,
    });
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

  createActionButton(
    text: string,
    actionId: string,
    value: string
  ): SlackBlockElement {
    return {
      type: "button",
      text: { type: "plain_text", text },
      action_id: actionId,
      value,
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

  private async slackApi<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(
    method: "chat.postMessage" | "chat.update" | "chat.postEphemeral",
    body: Record<string, unknown>
  ): Promise<T> {
    const res = await fetchExt({
      url: `https://slack.com/api/${method}`,
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
      const message = `Slack ${method} HTTP ${res.status}`;
      this.logger?.error(message, { status: res.status });
      throw new Error(message);
    }

    const data = (await res.json()) as SlackApiResponse<T>;
    if (!data.ok) {
      const message = `Slack API error (${method}): ${data.error ?? "unknown"}`;
      this.logger?.error(message);
      throw new Error(message);
    }
    return data;
  }
}

function isText(payload: NotificationPayload): payload is TextNotification {
  return (payload as TextNotification).text !== undefined;
}
