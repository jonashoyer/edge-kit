# Architecture Decision Records — Guide

## What Is an ADR?

Architecture Decision Records (ADRs) document the key architectural and
implementation decisions made throughout the codebase — capturing not just
what was decided, but why, what alternatives were considered, and what
constraints the decision imposes on future development. Each ADR is a
permanent, version-controlled record tied to a specific decision point,
forming a living history that allows developers and AI agents to understand
the intent and boundaries of existing systems before extending them.

---

## When to Create an ADR

Create a new ADR when any of the following is true:

- A technology, library, or pattern is being adopted that will govern how a
  whole module or domain is built
- A constraint is being imposed that isn't obvious from reading the code
- A previous decision is being reversed or significantly modified
- A cross-cutting concern is being standardized (error handling, logging,
  auth, data access patterns)
- A public contract is being established or broken

Do NOT create an ADR for:
- Implementation details that only affect a single file
- Stylistic or formatting choices (use a linter config instead)
- Decisions that are trivially reversible with no downstream impact

---

## When to Update vs. Supersede

| Change type | Action |
|---|---|
| Typo, broken link, formatting | Edit in-place |
| Status change (Draft → Implemented) | Edit in-place |
| Adding observed consequences post-ship | Append with date note |
| Core decision has changed | Create new ADR, mark old as `Superseded by [NNNN]` |
| Constraint is being relaxed or removed | Create new ADR, mark old as `Superseded by [NNNN]` |

**The rule:** Edit in-place if the decision itself hasn't changed. Supersede
if the decision, constraint, or rationale has materially changed.

---

## File Naming

```
/docs/adr/records/0001-short-decision-title.md
```

- Always zero-padded to 4 digits
- Title slug must match the ADR title (kebab-case)
- Register every new ADR in `/docs/adr/overview.md`

---

## Folder Structure

```
/docs
  /adr
    overview.md          ← Index of all ADRs (ID, title, status, date)
    /records
      0001-*.md
      0002-*.md
```

---

## Template

See `/assets/adr-template.md`
