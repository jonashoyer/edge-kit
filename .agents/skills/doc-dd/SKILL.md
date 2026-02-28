---
name: Documentation-Driven Development (DocDD)
description: >
  Context-engineered, documentation-driven development workflow. Enforce that
  architectural decisions (ADRs) and feature context files (FEATURE.md) are
  drafted before implementation and reconciled after. Use when implementing a
  feature, making an architectural change, or modifying code that crosses
  feature boundaries or introduces cross-cutting concerns. Also use when the
  user explicitly asks to create or update ADRs or FEATURE.md files.
metadata.internal: true
---

## Folder Structure

```
/
├── scripts/
│   └── check-staleness.sh          ← CI staleness checker for FEATURE.md files
├── references/
│   ├── adr-guide.md                ← When and how to write ADRs (subagent use)
│   ├── feature-guide.md            ← When and how to write FEATURE.md (subagent use)
│   ├── pre-impl-agent.md           ← Instructions for pre-implementation subagent
│   └── post-impl-agent.md          ← Instructions for post-implementation subagents
└── assets/
    ├── adr-template.md             ← Canonical ADR template (subagent use)
    └── feature-template.md         ← Canonical FEATURE.md template (subagent use)
```

---

## Agent Instructions (Primary / Orchestrator)

You are the orchestrator. Your job is to manage the three-phase flow below
and write implementation code. All documentation authoring is delegated to
subagents.

**Do NOT** read `references/` or `assets/` files yourself — subagents will
read them. This keeps your context window free for implementation work.

Before implementing, do the following:
1. Read this file — understand the control flow and hard rules
2. Read any existing ADRs in `/docs/adr/records/` relevant to your task area
3. Read any `FEATURE.md` files in directories you intend to modify
4. Follow the control flow below — spawn subagents for doc work

Do not write implementation code until the pre-implementation phase completes.

---

## fork_context

All subagents in this workflow use `fork_context: true`. This means the
subagent inherits the **full conversation context** accumulated by the
primary agent up to the point of spawning — including all files read, tool
outputs, and reasoning. Do NOT spawn an empty subagent with only a brief
summary. The subagent must receive the full forked context so it can make
informed documentation decisions based on everything the primary agent knows.

---

## Control Flow

```
┌─────────────────────────────────────────────┐
│                 RECEIVE TASK                │
│         (ticket, PRD, or prompt)           │
└────────────────────┬────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│           PRE-IMPLEMENTATION PHASE          │
│                                             │
│  1. Parse task intent and scope             │
│  2. Read existing ADRs + FEATURE.md in      │
│     scope to understand constraints         │
│  3. Spawn PRE-IMPL SUBAGENT                 │
│     (see spawn directive below)             │
│  4. Review subagent output — confirm the    │
│     ADR decision before proceeding          │
└────────────────────┬────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│            IMPLEMENTATION PHASE             │
│                                             │
│  Write code respecting all constraints      │
│  from loaded FEATURE.md files and ADRs.     │
│  Track any decisions or deviations made     │
│  during implementation for post-phase.      │
└────────────────────┬────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│          POST-IMPLEMENTATION PHASE          │
│                                             │
│  Spawn POST-IMPL SUBAGENTS in parallel      │
│  (see spawn directives below)               │
└─────────────────────────────────────────────┘
```

---

## Spawn Directives

### Pre-Implementation Subagent

Spawn **one** subagent before implementation begins.

- **fork_context:** `true`
- **Directive:** As a subagent, read `references/pre-impl-agent.md` and follow its instructions.
  Draft or update the ADR for the decision(s) this task introduces.
- **Wait** for the subagent to complete and review its output before coding.

### Post-Implementation Subagent A — ADR Realignment

Spawn **one** subagent after implementation is complete.

- **fork_context:** `true`
- **Directive:** As a subagent, read `references/post-impl-agent.md` **Section A** and follow
  its instructions. Reconcile the Draft ADR with what was actually built.

### Post-Implementation Subagent B..N — FEATURE.md Update

Spawn **one subagent per impacted feature directory** after implementation,
in parallel with Agent A.

- **fork_context:** `true`
- **Directive:** As a subagent, read `references/post-impl-agent.md` **Section B** and follow
  its instructions for the assigned feature directory. Create or update the
  FEATURE.md for that feature area.

---

## ADR Index Maintenance

Every ADR must be registered in `/docs/adr/overview.md`.
After creating or superseding any ADR, update the index table:

```markdown
| ID     | Title                                      | Status       | Date       |
|--------|--------------------------------------------|--------------|------------|
| ADR-0001 | Use RS256-signed JWTs for auth            | Implemented  | 2026-01-10 |
| ADR-0002 | Use PostgreSQL as primary data store      | Implemented  | 2026-01-12 |
```

---

## Hard Rules for All Agents

- **Never implement code that violates a constraint in a FEATURE.md or ADR**
  without first creating a superseding ADR and getting it reviewed
- **Never skip the pre-implementation phase** — an ADR must exist before code
  is written
- **Never update an ADR's core decision in-place** — supersede it with a new
  record
- **Always update `Last Reviewed`** on any FEATURE.md you touch, even for
  minor changes
- **If a FEATURE.md constraint is ambiguous**, surface it before proceeding
