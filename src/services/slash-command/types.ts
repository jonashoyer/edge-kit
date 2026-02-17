export type CommandStatus =
  | 'received'
  | 'acknowledged'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired';

export interface Progress {
  step: number;
  total: number;
  message: string;
}

export interface CommandState<
  TPayload = unknown,
  TRenderState extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  commandName: string;
  userId: string;
  channelId: string;
  status: CommandStatus;
  payload: TPayload;

  message?: {
    channelId: string;
    ts: string;
    threadTs?: string;
  };

  renderState?: TRenderState;
  progress?: Progress;
  result?: unknown;
  error?: string;

  createdAt: number;
  updatedAt: number;
}

export interface CommandContext<
  TPayload = unknown,
  TRenderState extends Record<string, unknown> = Record<string, unknown>,
> {
  state: CommandState<TPayload, TRenderState>;
  updateProgress: (progress: Progress) => Promise<void>;
  setRenderState: (renderState: TRenderState) => Promise<void>;
  complete: (result: unknown) => Promise<void>;
  fail: (error: string) => Promise<void>;
}

export interface InteractionContext<
  TPayload = unknown,
  TRenderState extends Record<string, unknown> = Record<string, unknown>,
> {
  state: CommandState<TPayload, TRenderState>;
  update: (blocks: unknown[]) => Promise<void>;
  setState: (
    patch: Partial<CommandState<TPayload, TRenderState>>
  ) => Promise<void>;
  setRenderState: (renderState: TRenderState) => Promise<void>;
}

export interface CommandInteraction {
  commandId: string;
  actionId: string;
  userId: string;
  value?: string;
}

export interface CommandDefinition<
  TPayload = unknown,
  TResult = unknown,
  TRenderState extends Record<string, unknown> = Record<string, unknown>,
> {
  name: string;

  execute: (ctx: CommandContext<TPayload, TRenderState>) => Promise<TResult>;
  render: (state: CommandState<TPayload, TRenderState>) => unknown[];

  interactions?: Record<
    string,
    (
      interaction: CommandInteraction,
      ctx: InteractionContext<TPayload, TRenderState>
    ) => Promise<void>
  >;

  onComplete?: (
    ctx: CommandContext<TPayload, TRenderState>,
    result: TResult
  ) => Promise<void>;
  onError?: (
    ctx: CommandContext<TPayload, TRenderState>,
    error: Error
  ) => Promise<void>;

  ttlSeconds?: number;
}

export interface CommandEnvelope<TPayload = unknown> {
  platform: 'slack';
  commandName: string;
  payload: TPayload;
  userId: string;
  channelId: string;
  requestId?: string;
}
