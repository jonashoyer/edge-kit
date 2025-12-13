import { genId } from "../../utils/id-generator";
import type { Nullable } from "../../utils/type-utils";
import type { AbstractKeyValueService } from "../key-value/abstract-key-value";
import type { AbstractLogger } from "../logging/abstract-logger";
import { slashCommandKvNamespace } from "./slash-command-kv-namespace";
import type {
  CommandContext,
  CommandDefinition,
  CommandEnvelope,
  CommandInteraction,
  CommandState,
  InteractionContext,
  Progress,
} from "./types";

type AnyCommandDefinition = CommandDefinition<
  unknown,
  unknown,
  Record<string, unknown>
>;

export abstract class AbstractSlashCommandService<TContext = unknown> {
  protected readonly kv: AbstractKeyValueService;
  protected readonly logger?: AbstractLogger;

  private readonly definitions = new Map<string, AnyCommandDefinition>();
  private fallbackRender?: (state: CommandState) => unknown[];
  private fallbackInteraction?: (
    interaction: CommandInteraction,
    ctx: InteractionContext
  ) => Promise<void>;

  constructor(kv: AbstractKeyValueService, logger?: AbstractLogger) {
    this.kv = kv;
    this.logger = logger;
  }

  register<TPayload, TResult, TRenderState extends Record<string, unknown>>(
    definition: CommandDefinition<TPayload, TResult, TRenderState>
  ): void {
    this.definitions.set(
      definition.name,
      definition as unknown as AnyCommandDefinition
    );
  }

  setFallbackRender(render: (state: CommandState) => unknown[]): void {
    this.fallbackRender = render;
  }

  setFallbackInteraction(
    handler: (
      interaction: CommandInteraction,
      ctx: InteractionContext
    ) => Promise<void>
  ): void {
    this.fallbackInteraction = handler;
  }

  async handleCommand(
    envelope: CommandEnvelope,
    context: TContext
  ): Promise<string> {
    const definition = this.definitions.get(envelope.commandName);
    if (!definition) {
      const message = `Unknown command: ${envelope.commandName}`;
      this.logger?.warn(message, {
        commandName: envelope.commandName,
        platform: envelope.platform,
      });
      throw new Error(message);
    }

    const ttlSeconds = definition.ttlSeconds ?? this.getDefaultTtlSeconds();

    if (envelope.requestId) {
      const existing = await this.kv.get<string>(
        slashCommandKvNamespace.key("request", envelope.requestId)
      );
      if (existing !== null) {
        // At-most-once: do not re-execute. Return the original commandId.
        return existing;
      }
    }

    const commandId = genId();

    if (envelope.requestId) {
      // Best-effort dedupe (KV may not support atomic set-if-not-exists)
      const key = slashCommandKvNamespace.key("request", envelope.requestId);
      const already = await this.kv.get<string>(key);
      if (already !== null) {
        return already;
      }
      await this.kv.set(key, commandId, ttlSeconds);
    }

    const now = Date.now();
    const state: CommandState = {
      id: commandId,
      commandName: envelope.commandName,
      userId: envelope.userId,
      channelId: envelope.channelId,
      status: "received",
      payload: envelope.payload,
      createdAt: now,
      updatedAt: now,
    };

    await this.setStateInternal(commandId, state, ttlSeconds);

    // Developer already returned 200; this is best-effort UX.
    await this.safeAcknowledge(state);

    // Create the persistent message immediately so later progress updates can edit it.
    await this.ensurePersistentMessage(state, definition, ttlSeconds);

    // Execute (developer may trigger a queue/worker). If this runs long, it's on the developer.
    const execution = this.executeInBackground(
      commandId,
      definition,
      ttlSeconds,
      context
    );
    execution.catch((error) => {
      this.logger?.error("Command execution task rejected", {
        commandId,
        error,
      });
    });

    return commandId;
  }

  async handleInteraction(interaction: CommandInteraction): Promise<void> {
    const state = await this.getState(interaction.commandId);
    if (state === null) {
      // State probably expired; treat as no-op to avoid retry storms.
      this.logger?.warn("Interaction for missing command state", {
        commandId: interaction.commandId,
        actionId: interaction.actionId,
      });
      return;
    }

    if (interaction.userId !== state.userId) {
      // Conservative default: only the initiating user can advance the workflow.
      this.logger?.warn("Interaction user mismatch", {
        commandId: state.id,
        actionId: interaction.actionId,
        expectedUserId: state.userId,
        actualUserId: interaction.userId,
      });
      return;
    }

    const definition = this.definitions.get(state.commandName);
    const handler = definition?.interactions?.[interaction.actionId];

    const ctx: InteractionContext = {
      state,
      update: async (blocks) => {
        await this.updateMessage(state, blocks);
      },
      setState: async (patch) => {
        const updated = await this.patchState(
          state.id,
          patch,
          definition?.ttlSeconds ?? this.getDefaultTtlSeconds()
        );
        ctx.state = updated;
      },
      setRenderState: async (renderState) => {
        const updated = await this.patchState(
          state.id,
          { renderState },
          definition?.ttlSeconds ?? this.getDefaultTtlSeconds()
        );
        ctx.state = updated;
        await this.renderAndSync(updated, definition);
      },
    };

    if (handler) {
      await handler(interaction, ctx);
      return;
    }
    if (this.fallbackInteraction) {
      await this.fallbackInteraction(interaction, ctx);
      return;
    }

    this.logger?.warn("No interaction handler registered", {
      commandId: state.id,
      actionId: interaction.actionId,
      commandName: state.commandName,
    });
  }

  async getState<
    TPayload = unknown,
    TRenderState extends Record<string, unknown> = Record<string, unknown>,
  >(
    commandId: string
  ): Promise<Nullable<CommandState<TPayload, TRenderState>>> {
    return await this.kv.get<CommandState<TPayload, TRenderState>>(
      slashCommandKvNamespace.key("command", commandId)
    );
  }

  protected abstract acknowledge(state: CommandState): Promise<void>;
  protected abstract postMessage(
    state: CommandState,
    blocks: unknown[]
  ): Promise<{ ts: string; channelId?: string; threadTs?: string }>;
  protected abstract updateMessage(
    state: CommandState,
    blocks: unknown[]
  ): Promise<void>;
  protected abstract sendEphemeral(
    state: CommandState,
    text: string
  ): Promise<void>;
  protected getDefaultTtlSeconds(): number {
    return 3600;
  }

  private async safeAcknowledge(state: CommandState): Promise<void> {
    try {
      await this.acknowledge(state);
      await this.patchState(state.id, { status: "acknowledged" });
    } catch (error) {
      this.logger?.warn("Acknowledge failed", {
        commandId: state.id,
        error,
      });
    }
  }

  private async ensurePersistentMessage(
    state: CommandState,
    definition: AnyCommandDefinition,
    ttlSeconds: number
  ): Promise<void> {
    const blocks = this.renderForState(state, definition);

    const posted = await this.postMessage(state, blocks);
    const nextMessage = {
      channelId: posted.channelId ?? state.channelId,
      ts: posted.ts,
      threadTs: posted.threadTs,
    };
    const updated = await this.patchState(
      state.id,
      { message: nextMessage },
      ttlSeconds
    );
    state.message = updated.message;
  }

  private async executeInBackground(
    commandId: string,
    definition: AnyCommandDefinition,
    ttlSeconds: number,
    _context: TContext
  ): Promise<void> {
    const state = await this.getState(commandId);
    if (state === null) {
      return;
    }

    const ctx = this.makeCommandContext(state, definition, ttlSeconds);

    await this.patchState(commandId, { status: "processing" }, ttlSeconds);
    await this.renderAndSync(
      await this.getRequiredState(commandId),
      definition
    );

    try {
      const result = await definition.execute(ctx);
      await ctx.complete(result);
      if (definition.onComplete) {
        await definition.onComplete(ctx, result);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.fail(message);
      if (definition.onError && error instanceof Error) {
        await definition.onError(ctx, error);
      }
    }
  }

  private makeCommandContext(
    initialState: CommandState,
    definition: AnyCommandDefinition,
    ttlSeconds: number
  ): CommandContext<unknown, Record<string, unknown>> {
    const ctx: CommandContext<unknown, Record<string, unknown>> = {
      state: initialState,
      updateProgress: async (progress: Progress) => {
        const updated = await this.patchState(
          initialState.id,
          { progress },
          ttlSeconds
        );
        ctx.state = updated;
        await this.renderAndSync(updated, definition);
      },
      setRenderState: async (renderState: Record<string, unknown>) => {
        const updated = await this.patchState(
          initialState.id,
          { renderState },
          ttlSeconds
        );
        ctx.state = updated;
        await this.renderAndSync(updated, definition);
      },
      complete: async (result: unknown) => {
        const updated = await this.patchState(
          initialState.id,
          { status: "completed", result },
          ttlSeconds
        );
        ctx.state = updated;
        await this.renderAndSync(updated, definition);
      },
      fail: async (error: string) => {
        const updated = await this.patchState(
          initialState.id,
          { status: "failed", error },
          ttlSeconds
        );
        ctx.state = updated;
        await this.renderAndSync(updated, definition);
      },
    };
    return ctx;
  }

  private async renderAndSync(
    state: CommandState,
    definition: AnyCommandDefinition | undefined
  ): Promise<void> {
    const blocks = definition
      ? this.renderForState(state, definition)
      : this.renderFallback(state);
    if (!state.message) {
      if (definition) {
        await this.ensurePersistentMessage(
          state,
          definition,
          definition.ttlSeconds ?? this.getDefaultTtlSeconds()
        );
      }
      return;
    }
    await this.updateMessage(state, blocks);
  }

  private renderForState(
    state: CommandState,
    definition: AnyCommandDefinition
  ): unknown[] {
    return definition.render(state);
  }

  private renderFallback(state: CommandState): unknown[] {
    if (this.fallbackRender) {
      return this.fallbackRender(state);
    }
    return [
      { type: "section", text: { type: "mrkdwn", text: "*Processing…*" } },
    ];
  }

  private async patchState(
    commandId: string,
    patch: Partial<CommandState>,
    ttlSeconds?: number
  ): Promise<CommandState> {
    const current = await this.getRequiredState(commandId);
    const next: CommandState = {
      ...current,
      ...patch,
      updatedAt: Date.now(),
    };
    await this.setStateInternal(
      commandId,
      next,
      ttlSeconds ?? this.getDefaultTtlSeconds()
    );
    return next;
  }

  private async getRequiredState(commandId: string): Promise<CommandState> {
    const state = await this.getState(commandId);
    if (state === null) {
      throw new Error(`Command state missing: ${commandId}`);
    }
    return state;
  }

  private async setStateInternal(
    commandId: string,
    state: CommandState,
    ttlSeconds: number
  ): Promise<void> {
    await this.kv.set(
      slashCommandKvNamespace.key("command", commandId),
      state,
      ttlSeconds
    );
  }
}
