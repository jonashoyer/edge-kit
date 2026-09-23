export type CommandStatus =
  | 'received'
  | 'acknowledged'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired';

export interface Progress {
  message: string;
  step: number;
  total: number;
}

export interface CommandState<
  TPayload = unknown,
  TRenderState extends Record<string, unknown> = Record<string, unknown>,
> {
  channelId: string;
  commandName: string;

  createdAt: number;
  error?: string;
  id: string;

  message?: {
    channelId: string;
    ts: string;
    threadTs?: string;
  };
  payload: TPayload;
  progress?: Progress;

  renderState?: TRenderState;
  result?: unknown;
  status: CommandStatus;
  updatedAt: number;
  userId: string;
}

export interface CommandContext<
  TPayload = unknown,
  TRenderState extends Record<string, unknown> = Record<string, unknown>,
> {
  complete: (result: unknown) => Promise<void>;
  fail: (error: string) => Promise<void>;
  setRenderState: (renderState: TRenderState) => Promise<void>;
  state: CommandState<TPayload, TRenderState>;
  updateProgress: (progress: Progress) => Promise<void>;
}

export interface InteractionContext<
  TPayload = unknown,
  TRenderState extends Record<string, unknown> = Record<string, unknown>,
> {
  setRenderState: (renderState: TRenderState) => Promise<void>;
  setState: (
    patch: Partial<CommandState<TPayload, TRenderState>>
  ) => Promise<void>;
  state: CommandState<TPayload, TRenderState>;
  update: (blocks: unknown[]) => Promise<void>;
}

export interface CommandInteraction {
  actionId: string;
  commandId: string;
  userId: string;
  value?: string;
}

export interface CommandDefinition<
  TPayload = unknown,
  TResult = unknown,
  TRenderState extends Record<string, unknown> = Record<string, unknown>,
> {
  execute: (ctx: CommandContext<TPayload, TRenderState>) => Promise<TResult>;

  interactions?: Record<
    string,
    (
      interaction: CommandInteraction,
      ctx: InteractionContext<TPayload, TRenderState>
    ) => Promise<void>
  >;
  name: string;

  onComplete?: (
    ctx: CommandContext<TPayload, TRenderState>,
    result: TResult
  ) => Promise<void>;
  onError?: (
    ctx: CommandContext<TPayload, TRenderState>,
    error: Error
  ) => Promise<void>;
  render: (state: CommandState<TPayload, TRenderState>) => unknown[];

  ttlSeconds?: number;
}

export interface CommandEnvelope<TPayload = unknown> {
  channelId: string;
  commandName: string;
  payload: TPayload;
  platform: 'slack';
  requestId?: string;
  userId: string;
}
