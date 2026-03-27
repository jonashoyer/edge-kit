---
name: inngest
description: Design, review, and implement Inngest functions and durable workflows with correct step boundaries, event contracts, idempotency, retries, concurrency control, scheduling, and persistence boundaries. Use when building or debugging Inngest jobs, event-driven background processing, fan-out pipelines, scheduled functions, or long-running workflows, especially when deciding what belongs in events, steps, durable storage, or downstream systems.
---

# Inngest

Use Inngest as a durable orchestration layer for background work. Model the
workflow around checkpoints, retries, and explicit side-effect boundaries rather
than request-response code that happens to run asynchronously.

## Load references when needed

- Read [`references/payload-discipline.md`](references/payload-discipline.md)
  when events or step outputs may become large, expensive to recompute, or
  naturally belong in the database or blob storage.
- Read [`references/patterns.md`](references/patterns.md) when choosing a
  workflow shape such as ingest-then-process, fan-out, scheduled sweeps, or
  long waits between steps.

## Operating model

- Use events to represent durable business transitions or background work to
  start.
- Use steps as real checkpoints around meaningful work: fetch, transform,
  persist, wait, notify, fan out, or finalize.
- Keep canonical state outside Inngest.
- Treat retries as normal, not exceptional.
- Design every external side effect so it can be retried safely or skipped
  safely.

## Default design rules

- Start from the final durable outcome, then design backward.
- Prefer small, typed event payloads.
- Prefer small, replay-safe step inputs and outputs.
- Pass references instead of large objects.
- Persist expensive or important intermediates early.
- Re-read canonical state before irreversible side effects.
- Keep step names stable and descriptive for observability and replay clarity.

## Event rules

- Use typed, versioned events.
- Include only the data needed to route and authorize the work.
- Include stable identifiers, dedupe keys, and source metadata when relevant.
- Do not make event payloads the canonical store for large or evolving state.
- If an upstream system sends a large payload, store it first and emit an event
  with a reference.

## Step rules

- Use a step when the boundary matters for retries, durability, or debugging.
- Return only what later steps actually need.
- If a step produces data that is large or important, persist it in that step
  and return a reference.
- Query canonical state by ID in downstream steps instead of trusting stale
  serialized snapshots.
- Avoid combining multiple unrelated side effects in one step.

## Reliability rules

- Make writes idempotent with conflict handling, dedupe keys, or state checks.
- Control concurrency deliberately for fan-out work and external APIs.
- Batch large workloads using cursors, shards, or pages instead of giant arrays.
- Put rate limits and backpressure close to the downstream system that needs
  protection.
- Use sleeps and schedules for business timing, not ad hoc polling loops.

## Review checklist

- Is this workflow broken into meaningful checkpoints?
- Is canonical state stored outside Inngest?
- Are events and step outputs small and stable?
- Can every side effect be retried safely?
- Are concurrency and batching explicit?
- Does the workflow move data toward its final destination rather than carrying
  large intermediates across steps?
