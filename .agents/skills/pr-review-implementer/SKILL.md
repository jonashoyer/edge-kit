---
name: pr-review-implementer
description: Fetch GitHub pull request context, inspect changed files and review comments, translate reviewer feedback into local code changes, and push updates back to the PR branch. Use when an agent is given a PR number and asked to address review comments, requested changes, reviewer notes, or PR feedback directly in code.
---

# PR Review Implementer

## Overview

Use this skill when the job is not to review a PR, but to act as the implementer
for reviewer feedback already left on a PR. The core loop is: ingest PR
context, map comments to code, implement the requested changes, validate them,
and update the PR branch.

Use the bundled fetch script for ingestion instead of retyping `gh` and `jq`
commands. The script preserves the exact command shape requested by the user and
adds a structured diff snapshot.

## Workflow

1. Check repository state before mutating anything.
   - If the worktree is dirty and the changes are unrelated, stop and avoid
     mixing PR work with local work.
   - Confirm `gh auth status` succeeds if GitHub access is uncertain.
2. Fetch PR context.
   - Run
     `bash ./scripts/fetch_pr_review_context.sh <PR_NUM>`.
   - Read `pr-view.txt`, `pr.json`, `pr.diff`, and `review-comments.json` from
     the output directory.
3. Move to the PR branch.
   - Prefer `gh pr checkout <PR_NUM>` when you need a local branch wired to the
     PR head.
   - If the branch is already checked out, pull or rebase conservatively. Do
     not overwrite user changes.
4. Triage the review comments before editing.
   - Group comments by file and theme.
   - Separate mechanical fixes from comments that change behavior or public
     contracts.
   - Treat ambiguous comments as blockers to clarify, not as invitations to
     improvise.
5. Implement the requested changes in the local checkout.
   - Read the commented lines and surrounding code before editing.
   - Follow the repo’s existing patterns; do not use the review comment as an
     excuse for a broad refactor unless the comment explicitly requires it.
   - If several comments point to the same root cause, fix the root cause once.
6. Commit and push only when the task includes updating the PR branch.
   - Use a commit message that reflects the reviewer-directed fix.
   - Push to the PR head branch, not to a new feature branch, unless the user
     asked otherwise.

## Ingestion Commands

The fetch script wraps these commands:

- PR overview:
  `gh pr view <PR_NUM>`
- Structured PR metadata:
  `gh pr view <PR_NUM> --json number,title,body,url,baseRefName,headRefName,author,isDraft,files`
- PR diff:
  `gh pr diff <PR_NUM>`
- Review comments:
  `gh api repos/:owner/:repo/pulls/<PR_NUM>/comments | jq '.[] | { path: .path, line: .line, diff_hunk: .diff_hunk, comment: .body, user: .user.login }'`

Use the raw commands directly only if the bundled script is unavailable.

## Decision Rules

- Prefer small, reviewer-aligned edits over opportunistic cleanup.
- Do not mark comments resolved unless the platform action is explicitly part of
  the task.
- Do not assume a comment is still valid if the referenced code has moved.
  Re-read the current file and reconcile the old diff hunk with the present
  implementation.
- If the feedback implies an API, schema, or behavior change beyond the PR
  scope, surface that risk before implementing.
- If a requested fix would create avoidable technical debt, implement the
  narrow clean version and explain why.

## Completion Criteria

Finish only when all requested comments have one of these outcomes:

- Implemented in code
- Intentionally deferred with a concrete reason
- Blocked on ambiguity or missing context

Report the exact validation you ran and whether the branch was pushed.
