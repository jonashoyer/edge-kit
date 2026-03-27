# Workflow Patterns

Use this reference when the main skill is not enough to choose a workflow shape.

## Ingest then process

Use when an upstream system sends a payload that may be large, noisy, or
expensive to re-fetch.

1. Persist the raw payload or create a draft entity immediately.
2. Emit or continue with a reference ID.
3. Normalize, enrich, and validate by reading that stored record.
4. Finalize the destination record or trigger follow-on work.

Prefer this for webhook processing, document pipelines, and AI workflows.

## Fan-out by reference

Use when work can be parallelized across many items.

1. Persist a job row or item set.
2. Fan out using job ID plus shard, page, or cursor.
3. Process each unit independently with explicit concurrency control.
4. Aggregate from durable job state, not from large arrays passed between steps.

Prefer this for batch imports, backfills, and external sync jobs.

## Scheduled sweep

Use when the source of truth already exists in your system and work should run
on a cadence.

1. Run on a schedule.
2. Query the current candidates from the database.
3. Enqueue or process them in bounded batches.
4. Record progress and skip already-processed items safely.

Prefer this for reminders, cleanup, reprocessing, and SLA checks.

## Long wait or human-in-the-loop

Use when the workflow must pause for time or an external decision.

1. Persist the tracked entity state.
2. Sleep or wait for the next event.
3. Resume by re-querying canonical state.
4. Re-check whether the action is still valid before proceeding.

Prefer this for onboarding drips, approval flows, and delayed follow-ups.

## External API workflow

Use when downstream systems impose rate limits or partial failures are common.

1. Keep event and step payloads minimal.
2. Limit concurrency at the function or step level.
3. Retry transient failures.
4. Persist progress markers so retries do not repeat completed work.
5. Separate fetch, transform, and write boundaries when that improves recovery.

Prefer this for CRM syncs, billing jobs, and vendor integrations.

## Selection prompts

- Is the source payload large or hard to re-fetch? Use ingest then process.
- Is the workload many independent items? Use fan-out by reference.
- Is the cadence the primary trigger? Use scheduled sweep.
- Does the workflow need time gaps or approvals? Use long wait.
- Is the risk concentrated in a downstream vendor? Use external API workflow.
