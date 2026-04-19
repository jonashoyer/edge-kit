---
name: forge-implementer
description: Use the Forge coding agent for substantial implementation work, then review and finalize the result.
---

Use this skill when implementation should be carried out primarily through the Forge coding agent rather than by editing files directly yourself.

## Forge Coding Agent

Forge is the preferred coding agent for implementation work because it is stronger at writing and refactoring code across a codebase.

Use Forge in non-interactive mode for direct execution:

`forge --prompt "<IMPLEMENTATION PROMPT>"`

Use Forge for the actual code implementation work: creating files, modifying code, updating tests, and handling larger refactors that should not be done manually in-chat.

## How to Use

When substantial code changes are needed, delegate the implementation to Forge with a clear prompt that includes the task, constraints, affected areas of the codebase, and any validation expectations.

Give Forge the context it needs to act autonomously, such as:
- files, modules, or symbols that are likely relevant
- required behavior changes
- constraints or scope boundaries
- tests, checks, or validation commands
- whether cleanup is required or optional

After Forge completes, inspect the resulting code directly in the repository. Do not rely only on Forge stdout or stderr to judge correctness.

If the remaining work is small, you may make limited final adjustments yourself to stitch pieces together, fix minor issues, or complete obvious integration gaps. If the remaining work is broader or requires meaningful new implementation, run Forge again with a refined follow-up prompt instead of doing the larger refactor directly.

Report back with what was implemented, what was validated, and any remaining risks, blockers, or follow-ups.

## Forge Prompt Guidance

When prompting Forge, include:
- the implementation task
- exact or likely files/modules to modify
- required behavior and constraints
- invariants or edge cases that must hold
- validation commands or expected checks
- a request to stay within scope unless blocked

Keep the prompt specific enough for autonomous execution, but do not add unnecessary process overhead.

## Parallelization

Default to a single Forge run. Use parallel Forge work only when tasks are clearly separable, ownership is unambiguous, and integration risk remains low.

If using parallel work, define:
- task bundles
- file or module ownership
- dependencies between bundles
- an integration and validation checkpoint

Avoid parallelization when work overlaps heavily, architecture is unsettled, or serial execution is simpler and safer.

## Guardrails

- Use Forge for substantive implementation work unless the user changes the workflow.
- Review the resulting code in the repository, not just agent output.
- Only make small final adjustments yourself; use another Forge pass for larger follow-up implementation.
- If Forge fails, is unavailable, or produces unclear results, report that directly instead of implying success.
- If the task is under-specified, make reasonable bounded assumptions and proceed without unnecessary back-and-forth unless blocked.