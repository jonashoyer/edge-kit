---
name: dev-launcher-session-cli
description: Operate and reason about a socket-backed dev launcher through the `pnpm cli dev ...` command surface. Use when an agent needs to inspect a live dev session, start or stop services, apply a service set, fetch recent logs, attach to an existing launcher, or decide whether `no_session` should be treated as expected versus triggering a mutating command that may auto-bootstrap the host. Also use when implementing or debugging a copied or embedded dev-launcher session CLI so changes preserve one-host-per-repo-root, macOS-only bootstrap, JSON-RPC socket runtime semantics, and CLI-only `--toon` output.
---

# Dev Launcher Session CLI

## Overview

Use the CLI as the supported agent control surface for live dev services in any
repo that embeds this launcher pattern. Prefer `pnpm cli dev ...` subcommands
over raw socket calls, terminal scraping, or ad hoc process management.

Read `references/intent-and-contract.md` when you need the architectural
reasoning behind the command surface or the exact lifecycle rules before
changing behavior.

## Workflow

1. Classify the task.
   - Read-only: `status`, `logs`, `attach`
   - Service mutation: `service start|stop|restart`, `services apply`
   - Session lifecycle: `pnpm cli dev`, `host --headless`, `session stop`
2. Choose the narrowest command that matches the intent.
3. Prefer structured output when another tool or agent will consume the result.
4. Treat `no_session` according to command class instead of improvising.

## Command Selection

- Start or attach to the normal foreground launcher:
  `pnpm cli dev`
- Start or attach and request a specific managed set:
  `pnpm cli dev --services app,api`
- Start an explicit detached host with no UI:
  `pnpm cli dev host --headless --services app,api`
- Attach to an already-running session only:
  `pnpm cli dev attach`
- Read the current session snapshot:
  `pnpm cli dev status --json`
- Start, stop, or restart one service:
  `pnpm cli dev service restart api --json`
- Reconcile the whole managed set:
  `pnpm cli dev services apply --services app,api --json`
- Read bounded logs:
  `pnpm cli dev logs api --after 120 --limit 100 --json`
- Follow logs:
  `pnpm cli dev logs api --follow`
- Stop the entire session host and all managed services:
  `pnpm cli dev session stop --json`

## Operating Rules

- Prefer `--json` for automation, parsing, and anything script-stable.
- Use `--toon` only when an LLM is reading non-streaming stdout directly.
- Do not use `--toon` with `logs --follow`; that combination is rejected.
- Treat plain text output as human-oriented and unstable.
- Do not call `osascript` or the Unix socket directly unless you are working on
  launcher internals. The CLI already owns discovery, stale cleanup, bootstrap,
  and error mapping.
- Do not scrape Terminal output to infer state. Ask the launcher through
  `status`, `logs`, or a service command.
- Do not kill service processes directly. Use `service ...` or `session stop`.
- Do not use `attach` in non-interactive contexts.

## `no_session` Policy

- `status`, `logs`, and `attach` are intentionally side-effect free. If they
  return `no_session`, surface that state or choose a mutating command on
  purpose.
- `service start`, `service stop`, `service restart`, and `services apply`
  auto-bootstrap on macOS when no session exists. Let the CLI do that work.
- `session stop` does not auto-bootstrap. If no session exists, the correct
  result is still `no_session`.
- `pnpm cli dev` is the human-first entrypoint. If no session exists, it starts
  a foreground host and then attaches. If a session exists, it attaches instead
  of duplicating supervision.

## Ownership Semantics

- If `pnpm cli dev` created the foreground host, exiting that command tears down
  the host and its managed services.
- If `pnpm cli dev` or `attach` connected to an existing host, exiting only
  detaches the client.
- There is exactly one live host per repo root. The host owns
  `DevLauncherProcessManager`; clients do not.

## Log Reading

- Use `logs <serviceId>` for service-specific output.
- Use `--after <highestSequence>` to poll incrementally.
- Use `--limit` to keep responses bounded.
- Expect non-follow structured results to contain:
  - `ok`
  - `serviceId`
  - `highestSequence`
  - `entries`
- Expect each log entry to carry `sequence`, `timestamp`, `serviceId`,
  `stream`, `runId`, and `line`.

## Structured Output Contract

- `status`, `service ...`, and `services apply` return `{ ok, session }` in
  structured modes.
- `logs` without `--follow` returns
  `{ ok, serviceId, highestSequence, entries }`.
- `session stop` returns `{ ok, stopped: true }`.
- Structured failures return
  `{ ok: false, error: { code, message, details? } }`.
- `--toon` and `--json` render the same logical envelopes. Only the wire format
  differs.

## When Modifying The Launcher

Review the local launcher implementation before changing behavior. In the
reference implementation, that means:

- `docs/adr/records/0019-add-a-socket-backed-session-host-to-the-dev-launcher.md`
- `src/cli/dev-launcher/FEATURE.md`
- `src/cli/dev-launcher/command.ts`
- `src/cli/dev-launcher/session-commands.ts`
- `src/cli/dev-launcher/session-client.ts`
- `src/cli/dev-launcher/session-server.ts`
- `src/cli/dev-launcher/session-state.ts`
- `src/cli/dev-launcher/session-bootstrap.ts`

If the host repo has local architecture or documentation workflows, use them
before changing the launcher contract.
