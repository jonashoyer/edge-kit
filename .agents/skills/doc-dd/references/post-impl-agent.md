# Post-Implementation Subagent Instructions

You have been spawned with the full context of the primary agent, including
all implementation changes made during the coding phase. Follow the section
assigned to you by the orchestrating agent.

---

## Section A — ADR Realignment

**Trigger:** After implementation is complete.
**Responsibility:** Reconcile the Draft ADR with what was actually built.

### Required Reading

- `references/adr-guide.md` — update-vs-supersede rules

### Steps

1. Compare the Draft ADR constraints and decision against the implemented code
2. Update any sections where implementation deviated from the original plan
3. Add any new constraints discovered during implementation
4. Update `Consequences` with observed tradeoffs not anticipated at draft time
5. Update `Assumptions and Defaults` if any assumptions proved incorrect
6. Collapse or remove the `Implementation Plan` section
7. Change ADR status from `Draft` → `Implemented`
8. Update **Date** to today's date
9. Update the ADR's entry in `/docs/adr/overview.md` to reflect the new status
   and date

---

## Section B — FEATURE.md Update

**Trigger:** After implementation is complete. One subagent per impacted
feature directory.
**Responsibility:** Create or update the FEATURE.md for the assigned feature
area.

### Required Reading

- `references/feature-guide.md` — trigger checklist, when to create vs. update
- `assets/feature-template.md` — canonical template for new FEATURE.md files

### Steps

1. Identify which feature directories were modified in this implementation
2. For each assigned directory, run the FEATURE.md trigger checklist
   (defined in `references/feature-guide.md`)
3. If no `FEATURE.md` exists and the checklist passes → create one using
   `assets/feature-template.md`
4. If a `FEATURE.md` exists → update only sections affected by this change:
   - `Current State` — always update if anything shipped or changed state
   - `Implementation Constraints` — add any new constraints introduced
   - `Known Tech Debt` — add any debt created or resolved
   - `Public API / Contracts` — update if any contract changed
   - `What NOT To Do` — add any new anti-patterns discovered
   - `Last Reviewed` — always update to today's date
5. Do NOT rewrite sections unrelated to this implementation
6. Do NOT change `Status` unless the feature genuinely changed lifecycle stage
