---
name: write-technical-memo
description: Write high-signal codebase descriptions, technical memos, architecture summaries, README sections, and operational runbooks from inspected source code. Use when Codex needs to explain a codebase or subsystem for engineers, on-call responders, or technical stakeholders; document system context, blast radius, and dependencies; or translate implementation details into durable documentation with explicit constraints, trade-offs, and known issues.
---

# Write Technical Memo

## Overview

Write documentation as an empathy exercise for a tired but competent reader.
Translate a complex mental model into a document that is easy to scan during
implementation, onboarding, review, or an incident.

Inspect the code before writing. Prefer architecture, boundaries, trade-offs,
and operational consequences over line-by-line code narration.

## Workflow

1. Identify the reader and the job the document must do.
   - If the audience is unspecified, default to a new engineer or on-call peer.
   - Optimize for 2:00 AM readability, not author self-expression.
2. Inspect the smallest code and docs surface that explains the system.
   - Read the nearest `AGENTS.md`, local `README`, entrypoints, interfaces,
     tests, and config that define the runtime boundary.
   - Do not draft from filenames or assumptions.
3. Build the blast-radius model before drafting prose.
   - Define upstream callers, inputs, downstream systems, durable state,
     side effects, and failure domains.
   - Note what breaks, degrades, or pages someone if this region fails.
4. Elevate the "why" before the "how".
   - Explain why the design exists, not just what the code does.
   - Surface constraints, historical baggage, latency/cost trade-offs,
     migration costs, and rejected alternatives when they matter.
5. Write only the sections that carry real decision value.
   - Prefer concise, scannable sections over exhaustive commentary.
   - Collapse or omit sections that would only restate obvious code.
6. End with operator value.
   - Tell the reader how to run, debug, validate, and safely change the area.
   - Make failure modes and first-response steps easy to find.

## Audience Calibration

- For product or non-implementation stakeholders:
  focus on capabilities, system role, business impact, dependency risk, and
  operational consequences. Collapse low-level mechanics unless they change
  delivery risk or cost.
- For engineers:
  focus on boundaries, interfaces, state, core flows, failure modes,
  constraints, migrations, and change hazards.
- For future maintainers:
  state the invariants, the ugly parts, and the reasons the code looks this
  way. Do not make them reverse-engineer intent from implementation.

## Recommended Memo Shape

Use this default outline and trim aggressively when a section is not load
bearing:

```md
## Executive Summary
- State what the system or code region does.
- State why it exists and the primary business or operational value.

## System Context
- Upstream callers, inputs, and triggering conditions
- Downstream services, databases, queues, APIs, or files
- Core flow: request/event/data lifecycle in a few steps

## Key Decisions
- Explain the main architectural patterns and non-obvious logic.
- Prefer "why this approach" over "what every line does."

## Constraints, Assumptions, and Trade-offs
- Name assumptions that must remain true.
- Name bottlenecks, scaling limits, and operational sharp edges.
- Compare the chosen design against the obvious alternatives when useful.

## Known Issues and Technical Debt
- Be explicit about weak spots, missing coverage, or ugly design compromises.
- Do not hide ambiguity or unresolved debt.

## Operational Runbook
- Local setup or entrypoints
- Logs, metrics, traces, or dashboards
- Common alerts, likely causes, and first-response checks
- Safe change guidance and validation steps
```

## Writing Rules

- Lead with the recommendation or the TL;DR.
- Prefer short sections, bullets, tables, and diagrams over dense prose.
- Use Mermaid when a flow or dependency graph reduces cognitive load.
- Name trade-offs explicitly: what was optimized, what was sacrificed, and why.
- Write concrete statements about blast radius, not vague warnings.
- Document what is true because of design, not what is merely true today by
  accident.
- Keep examples and code snippets short and purposeful.

## Anti-Patterns

- Do not narrate the code line by line.
- Do not restate type names, function names, or obvious control flow the reader
  can inspect directly.
- Do not pretend uncertainty does not exist. If the code or ownership is
  ambiguous, say so plainly.
- Do not hide technical debt behind euphemisms.
- Do not make the document longer by repeating implementation detail instead of
  extracting intent.

## Final Check

Before finalizing, verify:

- A reader can answer "what is this, why does it exist, what does it touch,
  what can break, and how do I operate it?"
- The document would still be useful if the implementation changed slightly.
- The most important constraints and trade-offs are impossible to miss.
- A junior engineer or future you could use it under time pressure without
  reading the whole codebase first.
