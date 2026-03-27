# Payload Discipline

Use this reference when a workflow handles data that is large, expensive to
compute, or naturally belongs in a durable system outside Inngest.

## Default rule

If a step could return megabytes, redesign the workflow before writing code.
Large step results are not a convenient optimization. They are usually a sign
that the persistence boundary is in the wrong place.

## Decision table

| Data shape | Preferred storage | Pass between steps |
| --- | --- | --- |
| Final entity or record | Database row | Entity ID |
| Raw webhook body, transcript, document, or export | Blob/object store or raw-ingest table | Artifact key or raw row ID |
| Large normalized JSON that will become a record | Database row or staging table | Row ID |
| Batch item set | Job table plus rows, or blob/object storage | Job ID plus page, shard, or cursor |
| Derived AI output that is larger than a small typed object | Entity row, artifact table, or blob/object storage | Entity ID, artifact key, version |

## Placement rules

- Persist data close to where it is ultimately consumed.
- If the workflow exists to create or update a database entity, move data into
  that entity early and re-query it later.
- If the workflow exists to generate a file or artifact, upload it early and
  pass the storage key.
- If the source data is large but multiple steps need it, store it once and let
  each step fetch it by reference.

## Why this matters

Every large cross-step payload increases operational cost and failure surface:

- retries have more state to serialize and restore
- observability becomes harder because checkpoints contain bulky snapshots
- stale data survives longer than it should
- later steps become coupled to temporary object shapes instead of canonical
  persisted state

## Heuristics

Use direct step returns only for:

- IDs
- cursors
- counts
- timestamps
- enums
- compact typed results that are easy to understand at a glance

Do not use direct step returns for:

- full documents
- transcript text
- full parsed API responses that will later be stored
- full LLM outputs when a later step will normalize or persist them
- large arrays used only for later iteration

## Example: database-first normalization

Bad shape:

1. Fetch webhook payload.
2. Parse huge JSON.
3. Return parsed object from step.
4. Pass parsed object to later steps.
5. Insert database row at the end.

Better shape:

1. Fetch webhook payload.
2. Insert raw or draft row immediately.
3. Return row ID.
4. Normalize by querying the row.
5. Update the row with normalized fields.

## Example: artifact-first AI workflow

Bad shape:

1. Generate a long transcript summary.
2. Return the full summary object from a step.
3. Pass it to enrichment and delivery steps.

Better shape:

1. Generate the summary.
2. Store it as an artifact or update the tracked entity row.
3. Return artifact key or entity ID.
4. Downstream steps load the current version by reference.

## Review prompts

- What is the canonical owner of this data?
- Why is this payload crossing a step boundary at all?
- Could the consuming step query this by ID instead?
- If this step retries tomorrow, is the returned object still the right source
  of truth?
