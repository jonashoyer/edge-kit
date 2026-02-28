# Feature Context Files — Guide

## What Is a FEATURE.md?

Feature Context Files (`FEATURE.md`) document the current state, goals, and
implementation constraints of a discrete feature area within the codebase —
capturing not just what the feature does, but what rules govern how it must
be extended, what public contracts it owns, and what pitfalls to avoid. Each
`FEATURE.md` is a living snapshot co-located with the feature's code, giving
developers and AI agents the context they need to work within an existing
system without breaking it.

---

## Trigger Checklist

Run this checklist when a new feature directory is created or an existing
feature is significantly modified:

```
□ Does this feature have its own directory or service boundary?
□ Will other modules, routes, or agents call into this code?
□ Does it expose an API, event, or data contract?
□ Does it have constraints that aren't visible from reading the code alone?
□ Will more than one engineer work in this area?

If 2+ boxes are checked → create FEATURE.md on the first merge to main
If 1 box is checked    → add a comment block in the code for now; revisit at next PR
If 0 boxes are checked → no FEATURE.md needed
```

---

## When to Create

The trigger is the **PR that creates the module boundary** — not ticket
creation, not the first commit. The FEATURE.md is created as part of the PR
that introduces the feature's directory or service, even if sparse initially.

---

## When to Update

Update a FEATURE.md whenever:
- A constraint is added, removed, or changed
- The public API or contract surface changes
- A feature's lifecycle status changes (Active → Stable → Frozen → Deprecated)
- Known tech debt is introduced or resolved
- A new anti-pattern is discovered and should be documented
- The `Last Reviewed` date exceeds 90 days (flag via CI)

Always update `Last Reviewed` to today's date on any meaningful change.

---

## What NOT to Update In-Place

Unlike ADRs, FEATURE.md files are always updated in-place — they reflect
current state, not history. Historical decisions that drove constraints belong
in ADRs, not FEATURE.md. Keep cross-references via `Related ADRs`.

---

## Placement

FEATURE.md lives co-located with the feature's code:

```
/features
  /auth
    FEATURE.md     ← Here
    index.ts
    auth.service.ts
```

---

## Staleness

A FEATURE.md not updated in 90+ days should be flagged by CI for review.
See `/scripts/check-staleness.sh`.

---

## Template

See `/assets/feature-template.md`

---

## Relationship to ADRs and PRDs

```
PRD  ──→  ADR(s)  ──→  FEATURE.md
(intent)  (decisions    (living codebase
           made to       snapshot)
           fulfill it)
```

- **PRD** — upstream intent document; link via `PRD` field in FEATURE.md header
- **ADR** — explains *why* constraints exist; FEATURE.md explains *what* they are
- **FEATURE.md** — the always-current source of truth for working in this area
