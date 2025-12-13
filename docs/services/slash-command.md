# Slash Command Service

Async command orchestration for chat “slash commands” (Slack first), with KV-backed state + message edits for progress.

## Design Guarantees

- **Bot API only**: `chat.postMessage`, `chat.update`, `chat.postEphemeral`
- **Ephemeral = ack-only**: no progress edits assumed for ephemerals
- **Progress updates**: edit the same persistent message (no spam)
- **Buttons over reactions**: interactive Block Kit buttons (`action_id` + `value`)
- **KV state + TTL**: TTL is the primary cleanup mechanism
- **Idempotency**: at-most-once for `requestId` (best-effort KV dedupe)

## Primary API

- `SlackSlashCommandService`
  - `register({ name, execute, render, interactions, ttlSeconds })`
  - `handleCommand(envelope, context)` → `commandId`
  - `handleInteraction({ commandId, actionId, userId, value })`

## State + Rendering

- `state.renderState`: developer-defined “renderable state”
- `ctx.setRenderState(...)` or `ctx.updateProgress(...)`:
  - persists to KV
  - calls `render(state)` to produce blocks
  - edits the persistent message via `chat.update`

## Slack Interaction Parsing

- Slack sends button payloads with:
  - `action_id`: stable action identifier (e.g. `"confirm"`, `"cancel"`)
  - `value`: used to carry the `commandId` (and optional extra data)

Recommended parsing:

```ts
const payload = JSON.parse(req.body.payload);
await slash.handleInteraction({
  commandId: payload.actions[0].value,
  actionId: payload.actions[0].action_id,
  userId: payload.user.id,
});
```

## Notes

- This library does **not** run a queue/worker. `execute()` should typically enqueue work (or orchestrate external jobs) and update render state as needed.
