---
name: agents-md-authoring
description: Write, review, and trim AGENTS.md files for coding agents using an evidence-based approach. Use when Codex needs to create a new AGENTS.md, rewrite an overgrown one, decide what belongs in repo-level versus package-level agent instructions, or turn broad repository guidance into short, non-inferable, behavior-changing instructions.
---

# AGENTS.md Authoring

## Overview

Write AGENTS.md files as operational guidance, not as a second README. Keep the root file short, keep instructions concrete, and store only facts the agent cannot reliably infer from reading the repo.

## Workflow

1. Read the nearest existing `AGENTS.md` files, the local `README`, the relevant `package.json`, and the smallest set of scripts or CI files needed to understand how the repo actually runs.
2. Build a candidate list of instructions that are:
   - non-inferable from code search or standard tooling
   - specific enough to change agent behavior
   - scoped to the current repo or directory
3. Delete anything the agent can infer by reading nearby code, config, tests, or docs.
4. Apply the ambiguity test to every remaining line:
   - who is expected to act
   - what concrete action they must take
   - when the rule applies
   - what happens if the action cannot be completed
5. Split the remaining guidance by scope:
   - root `AGENTS.md`: repo-wide commands, global constraints, routing to deeper guidance
   - nested `AGENTS.md`: package or folder exceptions only
   - skills or deeper docs: long workflows, style guides, architecture explanations, checklists
6. Write the shortest file that still prevents repeated failure.
7. When rewriting an existing file, keep valid non-inferable lines, move deep guidance out, and delete generic or duplicated instructions.

## Keep

- non-obvious commands only when the command shape is not inferable from local files
- env or secret loading rules that are not discoverable from the command name alone
- generated-file or codegen rules
- dangerous commands, directories, or deployment surfaces
- runtime boundaries that are easy to violate and hard to infer from local files
- ownership rules for high-risk changes when the agent must escalate uncertainty or leave final verification to the developer
- the smallest meaningful verification command for the area being changed
- pointers to deeper package `AGENTS.md` files or repo skills

## Drop Or Move

- bootstrap or onboarding commands when they are standard, obvious, or irrelevant to most edit tasks
- architecture tours
- generic coding advice
- folder maps the agent can discover with `rg --files`
- instructions duplicated from `README`, `package.json`, CI, or obvious repo structure
- long style guides, review rubrics, or planning processes
- vague directives such as "be careful", "write clean code", "run tests", or "validate changes"

## Default Shape

Use this as the starting template and trim it further when possible:

```md
# <Repo> - AGENTS

- Cross-workspace boundary or import rule
- Runtime or deployment boundary
- Smallest architecture-preserving change rule
- High-risk validation rule with explicit ownership if direct validation is impossible
- Smallest meaningful verification command
- Dangerous command or generated-path rule
- Pointer to deeper package AGENTS.md files or skills
- Dirty-worktree rule if the repo commonly has intentional local diffs
```

Add install, bootstrap, or primary dev commands only when they are both non-obvious and likely to materially change agent behavior.

## Line Budget

- root `AGENTS.md`: aim for 15-30 lines
- nested `AGENTS.md`: aim for 15-45 lines
- exceed that only when omission would cause repeated operational mistakes

## Rewrite Test

Keep a line only if all of the following are true:
- the agent cannot reliably infer it from nearby code or standard tooling
- following it changes behavior or avoids a real failure
- it belongs at the current directory scope
- it is concrete enough to act on without interpretation

## Precision Test

Reject or rewrite a line when any key term is underspecified. Pay special attention to:

- `validate`: say whether this means a command, a test, a deploy check, a human review, or developer sign-off
- `verify`: say what artifact or path must be verified
- `when possible`: say what the agent must do when it is not possible
- `use`: say what to use and under what condition
- `avoid`: name the forbidden action or boundary

If a competent agent could ask "what exactly counts here?" then the line is still too vague for `AGENTS.md`.

## Ownership Test

High-risk instructions must make ownership explicit.

- If the agent can run a targeted check, say so.
- If the agent cannot directly validate a backend, DB, or deployment-impacting change, tell it to state that limitation explicitly.
- When final real-world verification belongs to a human, say that the developer retains final verification responsibility.

Prefer lines such as:

```md
- Do not treat reasoning alone as validation for backend or DB-affecting changes. Run targeted validation on the changed path when possible; if you cannot validate directly, say so explicitly and leave final verification responsibility with the developer.
```

Over lines such as:

```md
- Validate backend changes carefully.
```

## Preferred Patterns

- prefer one command over one paragraph
- prefer one exception over one philosophy
- prefer local instructions over global instructions
- prefer durable invariants over temporary project notes
- prefer explicit ownership over implied responsibility
- prefer one sharp warning over a broad safety sermon

## Deliverable

When asked to create or rewrite `AGENTS.md`:
1. Inspect the current local workflow and existing instructions.
2. Produce the leanest possible file that preserves only non-inferable operational guidance.
3. Tighten or remove any line that is inferable, onboarding-oriented, ambiguous, or missing ownership.
4. Explain, if useful, what guidance was deliberately moved to deeper docs or skills.
5. Read `references/research.md` when you need the evidence, inclusion checklist, or examples.
