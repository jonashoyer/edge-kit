# Feature: Slash Commands Service

## 1. Codebase-First Analysis

### Existing Code Search

- `SlackNotificationService`: `send()` with blocks, `chat.postMessage` API
- `SlackNotificationService:93-110`: block helpers (`createButton`, `createSection`, `createDivider`)
- `AbstractNotificationService`: `NotificationResponse` with `ts` (message timestamp)
- `AbstractKeyValueService`: full CRUD, TTL, `get/set/delete` pattern
- `NamespaceComposer`: type-safe KV key generation
- `fetchExt`: timeout, retry, backoff
- `genId`: unique ID generation (nanoid)
- `CustomError`: typed error codes
- `AbstractLogger`: logging pattern
- `tryCatch`: Result pattern for error handling
- `type-utils.ts`: `Nullable`, `Optional`, `AsyncFunction`

### Reusable Scaffolding

- `SlackNotificationService`: extend for `chat.update`, `chat.postEphemeral`
- `AbstractKeyValueService`: command state persistence
- `NamespaceComposer`: command key patterns (`cmd:{id}`, `cmd:req:{requestId}`)
- `genId`: command execution IDs
- `CustomError`: `CommandNotFoundError`, `CommandExecutionError`
- `fetchExt`: Slack API calls with resilience
- Abstract service pattern: DI, protected helpers

### External Research (If Necessary)

- Slack API: `chat.update` for editing, `chat.postEphemeral` for ack UX
- Slack Block Kit: `actions` block with interactive buttons (`action_id` + `value`)

## 2. Specifications

### User Stories

- Developer: register command with execute + render + interactions in one place
- Developer: acknowledge commands immediately (<3s for Slack)
- Developer: send progress updates via message edits
- Developer: render final output with interactive buttons
- Developer: handle button clicks as command-scoped state transitions
- System: persist command state in KV with TTL
- User: see loading indicator during processing
- User: interact with buttons to confirm/cancel/view details

### Technical Approach

- Abstract class: `AbstractSlashCommandService<TContext>`
- Command lifecycle: `received` → `acknowledged` → `processing` → `completed`/`failed`/`cancelled`/`expired`
- State machine stored in KV with TTL
- Immediate acknowledgment: ephemeral "Processing…" (ack-only, not editable)
- Progress + completion: edit a persistent message via Bot API (`chat.update`)
- **Command-scoped design**: `execute`, `render`, and `interactions` all defined together per command
- Platform-agnostic core, Slack-specific implementation first

### Interface Design

```typescript
// Command lifecycle states
type CommandStatus =
  | "received"
  | "acknowledged"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

// Stored command state
interface CommandState<
  TPayload = unknown,
  TRenderState = Record<string, unknown>,
> {
  id: string;
  commandName: string;
  userId: string;
  channelId: string;
  status: CommandStatus;
  payload: TPayload;
  // Message identity (Bot API editing)
  message?: {
    channelId: string;
    ts: string;
    threadTs?: string;
  };
  // Developer-defined renderable state
  renderState?: TRenderState;
  progress?: Progress;
  result?: unknown;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

// Progress update
interface Progress {
  step: number;
  total: number;
  message: string;
}

// Context passed to execute()
interface CommandContext<
  TPayload = unknown,
  TRenderState = Record<string, unknown>,
> {
  state: CommandState<TPayload, TRenderState>;
  updateProgress: (progress: Progress) => Promise<void>;
  setRenderState: (renderState: TRenderState) => Promise<void>;
  complete: (result: unknown) => Promise<void>;
  fail: (error: string) => Promise<void>;
}

// Context passed to interaction handlers
interface InteractionContext<
  TPayload = unknown,
  TRenderState = Record<string, unknown>,
> {
  state: CommandState<TPayload, TRenderState>;
  update: (blocks: unknown[]) => Promise<void>;
  setState: (
    patch: Partial<CommandState<TPayload, TRenderState>>
  ) => Promise<void>;
  setRenderState: (renderState: TRenderState) => Promise<void>;
}

// Interaction (button click)
interface CommandInteraction {
  commandId: string;
  actionId: string;
  userId: string;
  value?: string;
}

// Command definition — execute, render, interactions all together
interface CommandDefinition<
  TPayload = unknown,
  TResult = unknown,
  TRenderState = Record<string, unknown>,
> {
  name: string;

  // Execution
  execute: (ctx: CommandContext<TPayload, TRenderState>) => Promise<TResult>;

  // Render state → UI blocks (called after state changes)
  render: (state: CommandState<TPayload, TRenderState>) => unknown[];

  // Command-scoped interaction handlers (keyed by actionId)
  interactions?: Record<
    string,
    (
      interaction: CommandInteraction,
      ctx: InteractionContext<TPayload, TRenderState>
    ) => Promise<void>
  >;

  // Optional lifecycle hooks
  onComplete?: (
    ctx: CommandContext<TPayload, TRenderState>,
    result: TResult
  ) => Promise<void>;
  onError?: (
    ctx: CommandContext<TPayload, TRenderState>,
    error: Error
  ) => Promise<void>;

  ttlSeconds?: number; // Default: 3600 (1 hour)
}

// Platform request parsing
interface CommandEnvelope<TPayload = unknown> {
  platform: "slack";
  commandName: string;
  payload: TPayload;
  userId: string;
  channelId: string;
  requestId?: string; // Dedupe key for at-most-once execution
}

// Abstract service
abstract class AbstractSlashCommandService<TContext = unknown> {
  constructor(kv: AbstractKeyValueService, logger?: AbstractLogger);

  // Registration
  register<TPayload, TResult, TRenderState>(
    definition: CommandDefinition<TPayload, TResult, TRenderState>
  ): void;

  // Optional global fallback for unknown commands / legacy states
  setFallbackRender(render: (state: CommandState) => unknown[]): void;
  setFallbackInteraction(
    handler: (
      interaction: CommandInteraction,
      ctx: InteractionContext
    ) => Promise<void>
  ): void;

  // Handlers (called by developer's webhook/route handler)
  handleCommand(envelope: CommandEnvelope, context: TContext): Promise<string>;
  handleInteraction(interaction: CommandInteraction): Promise<void>;

  // State access
  getState<TPayload>(commandId: string): Promise<CommandState<TPayload> | null>;

  // Lifecycle (platform-specific)
  protected abstract acknowledge(state: CommandState): Promise<void>;
  protected abstract postMessage(
    state: CommandState,
    blocks: unknown[]
  ): Promise<{ ts: string }>;
  protected abstract updateMessage(
    state: CommandState,
    blocks: unknown[]
  ): Promise<void>;
  protected abstract sendEphemeral(
    state: CommandState,
    text: string
  ): Promise<void>;
}

// Slack implementation
class SlackSlashCommandService extends AbstractSlashCommandService<SlackCommandContext> {
  constructor(
    kv: AbstractKeyValueService,
    notification: SlackNotificationService,
    logger?: AbstractLogger,
    options?: { ttlSeconds?: number; loadingEmoji?: string }
  );

  // Block helpers
  createActionButton(
    text: string,
    actionId: string,
    commandId: string,
    value?: string
  ): SlackBlockElement;
  createProgressSection(progress: Progress): SlackBlock;
  createSection(text: string): SlackBlock;
  createDivider(): SlackBlock;
}
```

### Key Patterns

- **Command-Scoped Definition**: `execute`, `render`, `interactions` live together per command
- **Immediate Acknowledgment**: return 200 fast; ephemeral "Processing…" (ack-only, not editable)
- **Bot API Only**: all updates via `chat.postMessage` + `chat.update` using bot token
- **Editable Messages**: post persistent message; store `{channelId, ts, threadTs?}` in state; edit via `chat.update`
- **Interactive Buttons**: stable `action_id` per action type; `value` carries `commandId` (+ optional data)
- **Renderable State**: `setRenderState()` → triggers `render(state)` → `updateMessage()`
- **TTL**: auto-expire command state via KV TTL (default 1 hour)
- **Async Execution Delegation**: developer owns job execution; service owns trigger + state + UI
- **Idempotency**: at-most-once per `requestId` (dedupe in KV)
- **No Reactions**: buttons only for state flow (reactions are flaky)

### Example Usage

```typescript
const slash = new SlackSlashCommandService(kv, slack, logger);

slash.register({
  name: "/deploy",

  async execute(ctx) {
    await ctx.setRenderState({ stage: "validating" });
    await ctx.updateProgress({ step: 1, total: 3, message: "Validating…" });

    // developer runs actual work (queue, worker, etc.)
    const deployId = await triggerDeploy(ctx.state.payload);

    await ctx.setRenderState({ stage: "deploying", deployId });
    await ctx.updateProgress({ step: 2, total: 3, message: "Deploying…" });

    await waitForDeploy(deployId);

    await ctx.setRenderState({ stage: "done", deployId });
    await ctx.updateProgress({ step: 3, total: 3, message: "Done" });

    return { deployId };
  },

  render(state) {
    const { stage, deployId } = (state.renderState ?? {}) as {
      stage?: string;
      deployId?: string;
    };

    if (stage === "done") {
      return [
        slack.createSection(`Deploy complete: \`${deployId}\``),
        {
          type: "actions",
          elements: [
            slash.createActionButton("Confirm", "confirm", state.id),
            slash.createActionButton("Rollback", "rollback", state.id),
            slash.createActionButton("View Logs", "view_logs", state.id),
          ],
        },
      ];
    }

    const p = state.progress;
    return [
      slack.createSection(
        p ? `*${p.message}* (${p.step}/${p.total})` : "*Processing…*"
      ),
    ];
  },

  interactions: {
    async confirm(_interaction, ctx) {
      await ctx.setState({ status: "completed" });
      await ctx.update([slack.createSection("Confirmed. Deploy finalized.")]);
    },

    async rollback(_interaction, ctx) {
      await ctx.setRenderState({ stage: "rolling_back" });
      await ctx.update([slack.createSection("Rolling back…")]);
      // trigger rollback job...
    },

    async view_logs(_interaction, ctx) {
      const { deployId } = ctx.state.renderState as { deployId: string };
      await ctx.update([
        slack.createSection(`Logs: https://logs.example.com/${deployId}`),
      ]);
    },
  },

  ttlSeconds: 3600,
});

// Developer's HTTP handlers
app.post("/slack/commands", async (req, res) => {
  res.status(200).send(); // immediate ack
  await slash.handleCommand(
    {
      platform: "slack",
      commandName: req.body.command,
      payload: req.body,
      userId: req.body.user_id,
      channelId: req.body.channel_id,
      requestId: req.body.trigger_id,
    },
    { raw: req.body }
  );
});

app.post("/slack/interactions", async (req, res) => {
  res.status(200).send();
  const payload = JSON.parse(req.body.payload);
  await slash.handleInteraction({
    commandId: payload.actions[0].value,
    actionId: payload.actions[0].action_id,
    userId: payload.user.id,
  });
});
```

## 3. Development Steps

1. Create `src/services/slash-command/` directory
2. Implement `types.ts`:
   - `CommandStatus` type
   - `CommandState<TPayload, TRenderState>` interface
   - `Progress` interface
   - `CommandContext<TPayload, TRenderState>` interface
   - `InteractionContext<TPayload, TRenderState>` interface
   - `CommandInteraction` interface
   - `CommandDefinition<TPayload, TResult, TRenderState>` interface
   - `CommandEnvelope<TPayload>` interface
3. Implement `abstract-slash-command.ts`:
   - Constructor: `kv`, optional `logger`
   - `register()`: store command definitions in map (keyed by `name`)
   - `setFallbackRender()` / `setFallbackInteraction()`: optional global fallbacks
   - `handleCommand(envelope)`:
     - dedupe by `requestId` in KV
     - create state, call `acknowledge()`
     - post persistent message, store message identity
     - call `execute()`, catch errors → `onError` or mark failed
     - render and update message
   - `handleInteraction(interaction)`:
     - load state by `commandId`
     - find command by `state.commandName`
     - dispatch to `command.interactions?.[actionId]` (or fallback)
   - `getState()`: KV get
   - Protected setState helper (updates KV + `updatedAt`)
   - Abstract: `acknowledge()`, `postMessage()`, `updateMessage()`, `sendEphemeral()`
4. Implement `slash-command-kv-namespace.ts`:
   - Use `NamespaceComposer` for keys
   - Keys: `cmd:{id}`, `cmd:req:{requestId}` (dedupe)
5. Implement `slack-slash-command.ts`:
   - Extend `AbstractSlashCommandService<SlackCommandContext>`
   - Constructor: add `SlackNotificationService`, options
   - `acknowledge()`: `chat.postEphemeral` with loading message
   - `postMessage()`: `chat.postMessage`, return `{ ts }`
   - `updateMessage()`: `chat.update`
   - `sendEphemeral()`: `chat.postEphemeral`
   - Block helpers: `createActionButton()`, `createProgressSection()`, `createSection()`, `createDivider()`
6. Extend `SlackNotificationService`:
   - Add `update(channel, ts, blocks)` method
   - Add `postEphemeral(channel, user, text | blocks)` method
   - Add `createActionButton(text, actionId, value)` helper (interactive, no `url`)
7. Implement `errors.ts`:
   - `CommandNotFoundError extends CustomError<"COMMAND_NOT_FOUND">`
   - `CommandExecutionError extends CustomError<"COMMAND_EXECUTION_ERROR">`
   - `DuplicateCommandError extends CustomError<"DUPLICATE_COMMAND">` (dedupe hit)
8. Create `index.ts` barrel export
9. Create documentation: `docs/services/slash-command.md`
   - Architecture overview
   - Command-scoped design explanation
   - Slack setup guide
   - Interactive button patterns
   - Example multi-step workflow

---

## Clarifications

- **Multi-platform scope**: Slack-only for now; abstract interface for future adapters.
- **Queue integration**: Not this service's responsibility; developer owns job execution.
- **Webhook handler**: Service provides `handleCommand()` + `handleInteraction()` hooks; developer owns HTTP.
- **Concurrent commands**: Removed; no semaphore/concurrency limiting.
- **State cleanup**: Rely on KV TTL only.
- **Progress granularity**: Step-based; developer defines render surfaces.
- **Idempotency**: At-most-once; dedupe on `requestId` in KV.
- **Command-scoped design**: `execute`, `render`, `interactions` all defined together per command; optional global fallback for unknown/legacy states.
