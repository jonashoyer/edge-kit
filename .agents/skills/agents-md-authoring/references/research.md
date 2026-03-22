# AGENTS.md Research And Patterns

## Evidence Summary

- Treat `AGENTS.md` as a low-token control plane, not as a repository handbook.
- Prefer human-curated, minimal instruction files over generated boilerplate.
- Expect agents to follow instructions literally, including expensive or unnecessary rituals.
- Keep repo-root files very short and move deep guidance to nested `AGENTS.md` files, skills, or docs.
- Precision matters as much as brevity. Ambiguous lines often survive trimming but still fail because the model must guess what they mean.

## Why This Works

Recent AGENTS.md research showed a small benefit from concise human-written files and a regression from generic LLM-generated files. Trace analysis found that agents obeyed the files, but often by doing more grep, test, and checking work than the task actually needed. The implication is simple: every extra line should earn its token cost and behavioral cost.

Current tooling also favors scoped instructions. Codex merges `AGENTS.md` files from the repo root down to the current directory, so later and closer files override earlier guidance. GitHub Copilot likewise gives precedence to the nearest `AGENTS.md` in the directory tree. This supports a layered design:

1. root `AGENTS.md` for global operational facts
2. nested `AGENTS.md` for local exceptions
3. skills or deeper docs for long procedures

## Inclusion Checklist

Include a line only when the answer to every question is "yes":

1. Can the agent not reliably infer this by reading nearby code, config, tests, or scripts?
2. Does following this line materially change behavior, avoid breakage, or save wasted effort?
3. Is this instruction scoped to the repo or directory where the file lives?
4. Can the agent act on it without guessing?

Delete or move the line when the answer to any question is "no".

## Precision And Ownership Checklist

After a line passes the inclusion checklist, ask:

1. Does the line define the action precisely enough that the agent will not invent its own interpretation?
2. If the line mentions validation or verification, does it say what counts as evidence?
3. If the line matters for backend, DB, infra, or deployment risk, does it say who owns final verification when direct validation is unavailable?

Lines that fail these checks are still too vague even if they are short.

## Recommended Root File Shape

Keep the root file focused on:

- cross-workspace boundaries and runtime constraints
- architecture-preserving constraints
- explicit high-risk validation and ownership rules
- smallest meaningful verification command
- env or secret-loading rule
- generated-file or dangerous-path rule
- pointer to deeper package `AGENTS.md` files or skills
- dirty-worktree handling when intentional local diffs are common

Install, bootstrap, and dev commands are optional. Include them only when they are non-obvious and likely to change agent behavior.

Aim for roughly 8-15 lines.

## Recommended Nested File Shape

Use nested files only for local exceptions such as:

- package-specific test or build commands
- runtime or deployment constraints for that directory
- generated code or migration rules
- "do not edit" directories
- local skill pointers

Aim for roughly 8-25 lines.

## Anti-Patterns

Avoid putting these in `AGENTS.md`:

- onboarding commands by default
- generic clean-code advice
- long architecture summaries
- exhaustive folder inventories
- duplicated `README` content
- duplicated CI steps
- broad quality rituals that are not tied to the current scope
- ambiguous risk language without ownership, such as "validate carefully"
- temporary project status notes

## Before/After Example

Too broad:

```md
# Repo AGENTS

- This project uses TypeScript and React.
- Keep the code clean and readable.
- Understand the architecture before making changes.
- Run all tests before finishing.
- Follow best practices for security and performance.
```

Better:

```md
# Repo - AGENTS

- Use `pnpm with-env` for commands that need secrets.
- Do not edit `packages/api/src/gen`; run `pnpm codegen`.
- For changes under `packages/api`, verify with `pnpm -F @acme/api vitest run <target>`.
- Use `packages/api/AGENTS.md` for package-local rules.
```

More precise:

```md
# Repo - AGENTS

- Keep cross-workspace imports on `@acme/*`; do not introduce cross-package relative imports.
- Do not treat reasoning alone as validation for backend or DB-affecting changes. Run targeted validation on the changed path when possible; if you cannot validate directly, say so explicitly and leave final verification responsibility with the developer.
- Do not run destructive repo-wide cleanup commands unless the developer explicitly asks for them.
- Use the nearest package `AGENTS.md` when present.
```

## Authoring Rule Of Thumb

Write the smallest instruction set that changes agent behavior in the right way. If a detail is inferable, lengthy, or mainly useful to humans, move it out of `AGENTS.md`.
