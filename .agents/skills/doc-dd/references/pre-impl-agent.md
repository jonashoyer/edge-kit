# Pre-Implementation Subagent Instructions

You have been spawned with the full context of the primary agent. Your job
is to draft or update an ADR before implementation begins.

## Required Reading

Before proceeding, read:
1. `references/adr-guide.md` — ADR rules, when to create vs. supersede
2. `assets/adr-template.md` — canonical template for new ADRs

## Steps

1. Identify the core architectural or implementation decision being made
2. Check `/docs/adr/overview.md` — does an existing ADR cover this decision?
   - If yes and the decision is being *changed* → create a new superseding ADR
   - If yes and the decision is unchanged → no ADR action needed; report back
     to the orchestrating agent that no new ADR is required
   - If no → create a new ADR using `assets/adr-template.md`
3. Set ADR status to `Draft`
4. Populate all 🔴 HIGHEST WEIGHT sections at minimum:
   - TL;DR, Decision, Constraints
5. Leave the Implementation Plan section populated — it will be pruned
   post-implementation
6. Register the new ADR in `/docs/adr/overview.md`
7. Output the ADR file path and a one-line summary of the decision for the
   orchestrating agent to confirm before implementation proceeds
