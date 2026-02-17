import type { AbstractKeyValueService } from '../key-value/abstract-key-value';
import type { AbstractLogger } from '../logging/abstract-logger';
import type {
  SlackBlock,
  SlackBlockElement,
  SlackNotificationService,
} from '../notification/slack-notification';

import { AbstractSlashCommandService } from './abstract-slash-command';
import type { CommandState, Progress } from './types';

export type SlackCommandContext = {
  raw?: unknown;
};

export type SlackSlashCommandOptions = {
  ttlSeconds?: number;
  loadingEmoji?: string;
  ephemeralAcknowledgeText?: string;
};

export class SlackSlashCommandService extends AbstractSlashCommandService<SlackCommandContext> {
  private readonly slack: SlackNotificationService;
  private readonly ttlSeconds: number;
  private readonly loadingEmoji: string;
  private readonly ephemeralAcknowledgeText: string;

  constructor(
    kv: AbstractKeyValueService,
    notification: SlackNotificationService,
    logger?: AbstractLogger,
    options?: SlackSlashCommandOptions
  ) {
    super(kv, logger);
    this.slack = notification;
    this.ttlSeconds = options?.ttlSeconds ?? 3600;
    this.loadingEmoji = options?.loadingEmoji ?? ':loading:';
    this.ephemeralAcknowledgeText =
      options?.ephemeralAcknowledgeText ?? 'Processing your request…';
  }

  protected async acknowledge(state: CommandState): Promise<void> {
    await this.sendEphemeral(
      state,
      `${this.loadingEmoji} ${this.ephemeralAcknowledgeText}`
    );
  }

  protected async postMessage(
    state: CommandState,
    blocks: unknown[]
  ): Promise<{ ts: string; channelId?: string; threadTs?: string }> {
    const res = await this.slack.send({
      channel: state.channelId,
      blocks,
    });
    return { ts: res.ts, channelId: res.channel };
  }

  protected async updateMessage(
    state: CommandState,
    blocks: unknown[]
  ): Promise<void> {
    if (!state.message) return;
    await this.slack.update(state.message.channelId, state.message.ts, {
      blocks,
      text: ' ',
    });
  }

  protected async sendEphemeral(
    state: CommandState,
    text: string
  ): Promise<void> {
    await this.slack.postEphemeral(state.channelId, state.userId, { text });
  }

  // Block helpers
  createActionButton(
    text: string,
    actionId: string,
    commandId: string,
    value?: string
  ): SlackBlockElement {
    const payload = value ? `${commandId}:${value}` : commandId;
    return this.slack.createActionButton(text, actionId, payload);
  }

  createProgressSection(progress: Progress): SlackBlock {
    return this.slack.createSection(
      `*${progress.message}* (${progress.step}/${progress.total})`
    );
  }

  createSection(text: string): SlackBlock {
    return this.slack.createSection(text);
  }

  createDivider(): SlackBlock {
    return this.slack.createDivider();
  }

  protected override getDefaultTtlSeconds(): number {
    return this.ttlSeconds;
  }
}
