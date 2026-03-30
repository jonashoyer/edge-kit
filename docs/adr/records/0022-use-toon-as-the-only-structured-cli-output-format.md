# [0022] Use TOON as the only structured CLI output format

**Status:** `Implemented`

**Date:** 2026-03-30

---

## TL;DR

Reusable CLI modules under `src/cli/` should expose plain text for humans and
TOON for structured stdout. Public `--json` CLI output is removed from the dev
launcher and skills commands to avoid maintaining two parallel presentation
contracts for the same payloads. Internal JSON-based transports and storage,
such as JSON-RPC and lockfiles, remain unchanged.

---

## Decision

Edge Kit standardizes on TOON as the only structured output format for its
reusable CLI modules:

- default CLI output remains plain text for humans
- `--toon` is the only structured stdout option
- public `--json` flags are removed from reusable CLI command families
- internal JSON-based transports and persisted state stay JSON where they are
  the correct protocol or storage format

This applies immediately to the affected reusable CLI surfaces:

- `src/cli/dev-launcher/`
- `src/cli/skills/`

The dev-launcher session transport remains JSON-RPC 2.0 over a Unix domain
socket. The skills lockfile remains `skills-lock.json`.

Streaming constraints remain explicit:

- non-streaming structured commands may emit TOON
- `logs --follow` remains text-only until a stable structured streaming format
  is intentionally designed

### Alternatives Considered

- **Keep both `--json` and `--toon`:** Rejected. It duplicates test surface,
  docs, and compatibility burden for the same logical result envelopes.
- **Remove structured output entirely and keep plain text only:** Rejected.
  Agent-facing and automation-friendly commands still need a stable structured
  stdout contract.
- **Move TOON into runtime transports such as the session socket:** Rejected.
  TOON is a presentation format, not a replacement for well-defined local IPC
  protocols.

---

## Constraints

- Reusable CLI modules in `src/cli/` should not introduce new public `--json`
  stdout contracts without a superseding ADR.
- Transport and storage protocols may keep JSON when that is their actual
  contract rather than CLI presentation.
- Text remains the default CLI output mode.
- Structured streaming output stays out of scope until a dedicated format is
  specified.

---

## Consequences

Positive: the repo now has one structured CLI presentation format to document,
test, and maintain.

Positive: agent-facing CLI output aligns with the repo's existing TOON usage in
prompt/composer flows.

Negative: any downstream automation depending on `--json` CLI flags must migrate
to `--toon`.

Negative: structured follow-mode logs remain unavailable for now because JSON
frames are removed with no TOON streaming replacement.

---

## Current State

Implemented: dev-launcher structured commands now expose plain text or TOON,
with `--json` removed from the public command surface.

Implemented: `pnpm cli action list` now emits TOON when `--toon` is passed.

Implemented: skills commands now use `--toon` for structured output instead of
`--json`.

Implemented: README and feature documentation now describe TOON as the only
structured CLI output format for these modules.

---

## User Flow / Public API / Contract Changes

Before:

```bash
pnpm cli dev status --json
pnpm cli dev service restart api --json
pnpm cli action list --json
pnpm cli skills list --json
```

After:

```bash
pnpm cli dev status --toon
pnpm cli dev service restart api --toon
pnpm cli action list --toon
pnpm cli skills list --toon
```

---

## Related ADRs

- [ADR-0001] Use TOON as the default structured-data encoder in PromptComposer
- [ADR-0006] Add a TypeScript-defined developer actions subsystem
- [ADR-0019] Add a socket-backed session host to the dev launcher
- [ADR-0021] Add a skills CLI for installing and managing Codex skills
