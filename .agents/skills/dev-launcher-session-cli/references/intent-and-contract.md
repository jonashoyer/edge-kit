# Socket-Backed Dev Launcher: Intent And Contract

## What This Feature Is Trying To Achieve

This launcher is not just an interactive terminal UI. It is a local control
plane for live development services.

The point of the session host is to make the running dev environment
addressable in a way that is:

- local-first
- stateful
- safe to reason about
- shared by humans and agents
- independent from any single terminal window

The core move is architectural: supervision lives in one host process per repo
root, and every other interface becomes a client of that host.

That is why the TUI, plain runner, one-shot CLI commands, and future adapters
all need to sit on the same runtime contract instead of owning processes
themselves.

The pattern is meant to be portable across repositories. The implementation may
be copied into a new codebase, but the core contract should remain the same.

## Why The Design Looks Like This

### CLI as thin client

The CLI is not supposed to duplicate service orchestration logic. It should ask
the session host for state changes and render results.

That keeps:

- lifecycle logic in one place
- service state coherent across multiple invocations
- agent behavior deterministic

### JSON-RPC over a Unix socket

The runtime protocol is JSON-RPC 2.0 over a local Unix domain socket because
the launcher is already a local, stateful supervisor. This gives request IDs,
typed params, typed errors, and a persistent local control channel without
turning the feature into a network service.

This is intentionally not:

- MCP as the primary runtime protocol
- localhost HTTP
- PTY scraping
- TOON over the socket

### TOON as CLI output only

`--toon` exists to make stdout easier for an LLM to read when the agent is
using the CLI directly.

It is not part of the runtime contract. The runtime contract stays JSON over
the socket so the host remains easy to test, debug, and wrap with future
adapters.

The correct mental model is:

- JSON-RPC JSON payloads for host/client internals
- `--json` for stable script-facing CLI output
- `--toon` for optional LLM-friendly CLI rendering

## Invariants To Preserve

- Exactly one live session host per repo root
- `DevLauncherProcessManager` as the only supervision implementation
- User-local session metadata, never repo-shared state
- Stale metadata and stale socket cleanup before declaring a session live
- Pull-based log reads via `sequence`, not push subscriptions in v1
- Read-only commands remain side-effect free
- Auto-bootstrap is limited to service-mutation commands on macOS

## Command Semantics That Matter

### `pnpm cli dev`

This is the human-first entrypoint.

- No session exists:
  start a foreground host, then attach
- Session exists:
  attach to it instead of starting a second supervisor
- `--services` with existing session:
  apply the service set first, then attach

This command is special because ownership depends on whether it created the
foreground host.

### `pnpm cli dev host --headless`

This starts the session host without UI and is the explicit detached entrypoint.
It is also the bootstrap target used by the macOS Terminal flow.

### `status`, `logs`, `attach`

These are intentionally read-only from a session-lifecycle perspective.

If no session exists, the correct result is `no_session`. They should not open
Terminal or create a background host as a side effect.

### `service start|stop|restart` and `services apply`

These mutate managed service state. If no session exists, they may bootstrap a
headless host through Terminal on macOS and then retry through the same CLI.

This asymmetry is deliberate. It keeps read-only inspection predictable while
still letting an agent ask for a service to become live.

### `session stop`

This stops the host and every managed service, but it does not bootstrap. If
there is no live session, the correct answer is still `no_session`.

## Error Interpretation

Important error codes to handle explicitly:

- `no_session`
  The repo has no reachable live host right now.
- `unsupported_output_format`
  Usually `logs --follow --toon`.
- `invalid_params`
  Bad service ID or malformed request shape.
- `socket_error`
  Session metadata existed, but the socket was not reachable.

For structured output modes, errors are rendered as:

```json
{
  "ok": false,
  "error": {
    "code": "no_session",
    "message": "No dev launcher session is running for this repo."
  }
}
```

## How An Agent Should Think About This Surface

Do not treat this CLI as a bag of commands. Treat it as a local API with a
human wrapper.

Good agent behavior:

- choose the smallest command that satisfies the intent
- prefer `--json` when parsing matters
- use `--toon` only when readability matters more than machine parsing
- respect the read-only versus mutating split
- preserve host ownership semantics when reasoning about teardown

Bad agent behavior:

- launching arbitrary `pnpm dev` scripts directly
- scraping terminal buffers to guess service state
- inventing a second supervision path outside the session host
- treating TOON as the runtime protocol
- making read-only inspection commands create side effects

## Source Of Truth Files

When this skill becomes stale, reconcile it against the local launcher source
of truth. In the reference implementation, that means:

- `docs/adr/records/0019-add-a-socket-backed-session-host-to-the-dev-launcher.md`
- `src/cli/dev-launcher/FEATURE.md`
- `src/cli/dev-launcher/command.ts`
- `src/cli/dev-launcher/session-commands.ts`
- `src/cli/dev-launcher/session-client.ts`
- `src/cli/dev-launcher/session-server.ts`
- `src/cli/dev-launcher/session-state.ts`
- `src/cli/dev-launcher/session-bootstrap.ts`
