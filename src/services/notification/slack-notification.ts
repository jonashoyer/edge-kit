/** biome-ignore-all lint/style/noMagicNumbers: SlackNotificationService */
import { format } from 'node:util';

import { fetchExt } from '../../utils/fetch-utils';
import type { AbstractLogger } from '../logging/abstract-logger';
import {
  AbstractNotificationService,
  type NotificationPayload,
  type NotificationResponse,
  type TextNotification,
} from './abstract-notification';

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
      'chat.postMessage',
      body
    );

    this.logger?.info('Slack message sent', {
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
    await this.slackApi('chat.update', {
      blocks: payload.blocks,
      channel: channelId,
      text: payload.text ?? ' ',
      ts,
    });
  }

  async postEphemeral(
    channelId: string,
    userId: string,
    payload: { text?: string; blocks?: unknown[] }
  ): Promise<void> {
    await this.slackApi('chat.postEphemeral', {
      blocks: payload.blocks,
      channel: channelId,
      text: payload.text ?? ' ',
      user: userId,
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
      text: { text, type: 'plain_text' },
      type: 'button',
      url,
    };
  }

  createActionButton(
    text: string,
    actionId: string,
    value: string
  ): SlackBlockElement {
    return {
      action_id: actionId,
      text: { text, type: 'plain_text' },
      type: 'button',
      value,
    };
  }

  createSection(text: string): SlackBlock {
    return {
      text: { text, type: 'mrkdwn' },
      type: 'section',
    };
  }

  createDivider(): SlackBlock {
    return { type: 'divider' };
  }

  private buildBody(payload: NotificationPayload): Record<string, unknown> {
    const channel = payload.channel ?? this.defaultChannelId;
    if (isText(payload)) {
      return { channel, text: payload.text };
    }
    return { blocks: payload.blocks, channel };
  }

  private async slackApi<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(
    method: 'chat.postMessage' | 'chat.update' | 'chat.postEphemeral',
    body: Record<string, unknown>
  ): Promise<T> {
    const res = await fetchExt({
      init: {
        body: JSON.stringify(body),
        headers: {
          Authorization: `Bearer ${this.botToken}`,
          'Content-type': 'application/json; charset=utf-8',
        },
        method: 'POST',
      },
      retries: this.retries,
      retryDelay: this.retryDelay,
      timeout: this.timeoutMs,
      url: `https://slack.com/api/${method}`,
    });

    if (!res.ok) {
      const message = `Slack ${method} HTTP ${res.status}`;
      this.logger?.error(message, { status: res.status });
      throw new Error(message);
    }

    const data = (await res.json()) as SlackApiResponse<T>;
    if (!data.ok) {
      const message = `Slack API error (${method}): ${data.error ?? 'unknown'}`;
      this.logger?.error(message);
      throw new Error(message);
    }
    return data;
  }
}

function isText(payload: NotificationPayload): payload is TextNotification {
  // biome-ignore lint/suspicious/noUnnecessaryConditions: Validate the runtime payload as well as its discriminant before treating it as text.
  return 'text' in payload && payload.text !== undefined;
}
