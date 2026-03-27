# [0019] Add a socket-backed session host to the dev launcher

**Status:** `Implemented`

**Date:** 2026-03-27

---

## TL;DR

The dev launcher now runs behind a single local session host per repo root.
That host owns `DevLauncherProcessManager`, exposes JSON-RPC 2.0 over a Unix
domain socket, and lets both humans and agents control the live service set
through thin CLI commands instead of terminal scraping or duplicate launcher
processes. Structured CLI results can additionally be rendered as TOON for
LLM-friendly stdout without changing the socket protocol.

---

## Decision

The dev-launcher feature keeps its explicit TS/JS config model, but moves
service supervision behind a dedicated local session host:

- one live host per repo root
- one `DevLauncherProcessManager` per host
- JSON-RPC 2.0 over a Unix domain socket as the only runtime protocol in v1
- user-local session metadata for discovery

The session metadata is stored alongside other user-local launcher state and
includes:

- `sessionId`
- `repoRoot`
- `socketPath`
- `pid`
- `version`
- `startedAt`
- `mode` (`foreground` or `headless`)

The socket path lives under `/tmp` and is derived from a short repo-root hash
to avoid macOS Unix-socket path-length issues.

The reusable runtime now exposes these JSON-RPC methods:

- `session.get`
- `session.stop`
- `services.applySet`
- `service.start`
- `service.stop`
- `service.restart`
- `logs.read`

`logs.read` uses the existing in-memory log `sequence` cursor and remains
pull-based in v1. No push subscriptions or notification channels are added in
this phase.

The CLI becomes a thin client of the session host:

- `pnpm cli dev` starts a foreground host when no session exists, then attaches
  TUI or plain mode to that host
- `pnpm cli dev` attaches to an existing host instead of starting duplicate
  supervision
- `pnpm cli dev host --headless` starts the host without a UI
- `pnpm cli dev attach` attaches to an existing host
- `pnpm cli dev status`, `logs`, `service ...`, `services apply`, and
  `session stop` all operate through the same socket API
- read-only structured results support `--json` and `--toon`, with JSON kept
  as the stable machine-readable contract

TOON is explicitly scoped to CLI rendering only in this phase:

- the Unix-socket runtime protocol remains JSON-RPC with JSON payloads
- `--toon` is supported for non-streaming structured command results
- `logs --follow` keeps text lines or JSON frames and rejects TOON output

Bootstrap policy in v1 is intentionally asymmetric:

- mutating service commands auto-bootstrap when no session exists
- auto-bootstrap is macOS-only and opens Terminal.app to run the headless host
- read-only commands (`status`, `logs`, `attach`) fail fast with `no_session`

Foreground ownership remains compatible with prior UX:

- if `pnpm cli dev` started the foreground host, exiting that session stops the
  host and managed services
- if the CLI attached to an existing host, exiting only detaches the client

### Alternatives Considered

- **MCP as the primary runtime protocol:** Rejected. MCP is an adapter surface
  for model hosts, not the launcher's core local control plane.
- **Localhost HTTP:** Rejected. It adds unnecessary network semantics, port
  management, and exposure for a purely local supervisor.
- **TOON as the socket payload format:** Rejected. TOON is already a prompt-
  layer formatter in this repo and is being added here only as a CLI
  presentation format, not a transport contract.
- **PTY or terminal scraping:** Rejected. It is brittle for service lifecycle
  control and bounded log access.
- **Keep the TUI process as the supervision owner:** Rejected. It makes agent
  control unavailable whenever the UI process is not already running.

---

## Constraints

- v1 is macOS-only. Use Unix domain sockets only.
- Keep exactly one live session host per repo root.
- Keep `DevLauncherProcessManager` as the only process-supervision
  implementation.
- Keep the session API local-only and user-local. Do not add HTTP listeners,
  MCP transport, or repo-shared session state in this phase.
- Keep TOON out of the socket protocol. It is a CLI output option only.
- Keep log access pull-based in v1. Do not add server-push subscriptions.
- Auto-bootstrap only mutating service commands. Do not let read-only commands
  open Terminal unexpectedly.

---

## Consequences

Positive: the launcher gains a stable control plane that works for both humans
and agents and avoids duplicate `pnpm cli dev` stacks.

Positive: the TUI and plain runner can now attach to the same live supervisor
instead of owning process state directly.

Negative: the feature now owns session metadata, socket lifecycle, stale-host
cleanup, and a richer command surface that must stay coherent.

Observed tradeoff: `--toon` makes agent-facing stdout easier to read,
but the launcher now has to maintain both a stable JSON contract and a TOON
presentation layer for the same result envelopes.

Tech debt deferred or created: cross-platform IPC, log subscriptions,
multi-client attach coordination, and MCP/GUI adapters are explicitly out of
scope for this ADR.

---

## Current State

Implemented: a socket-backed session host, JSON-RPC client/server, local
session metadata, stale-session cleanup, CLI control commands, and macOS
Terminal bootstrap for mutating service commands.

Implemented: `pnpm cli dev` now starts or attaches to a session host instead
of directly owning `DevLauncherProcessManager`.

Implemented: the Ink TUI and plain runner can attach to an existing session and
detach cleanly without stopping services they did not start.

Implemented: structured CLI results can now be rendered as plain text, JSON,
or TOON, while the socket protocol remains JSON-only.

---

## User Flow / Public API / Contract Changes

Before:

- `pnpm cli dev` owned process supervision directly
- no external control plane existed for the live session

After:

```bash
pnpm cli dev
pnpm cli dev --services app,api
pnpm cli dev attach
pnpm cli dev host --headless
pnpm cli dev status --json
pnpm cli dev status --toon
pnpm cli dev service restart api --json
pnpm cli dev service restart api --toon
pnpm cli dev services apply --services app,api --json
pnpm cli dev services apply --services app,api --toon
pnpm cli dev logs api --after 10 --limit 50 --json
pnpm cli dev logs api --after 10 --limit 50 --toon
pnpm cli dev session stop
```

Runtime additions:

- `DevLauncherSessionServer`
- `DevLauncherSessionClient`
- `DevLauncherRemoteProcessController`
- session metadata helpers and socket-path helpers

---

## Related ADRs

- ADR-0003 - Use a manifest-driven dev launcher for repo and monorepo scripts
- ADR-0006 - Add a TypeScript-defined developer actions subsystem
- ADR-0017 - Use a shared TypeScript dev-launcher config and local recent
  selections
- ADR-0018 - Run dev actions inside the dev-launcher TUI
